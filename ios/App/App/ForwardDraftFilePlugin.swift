import Capacitor
import UIKit
import UniformTypeIdentifiers

@objc(ForwardDraftFilePlugin)
public class ForwardDraftFilePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "ForwardDraftFilePlugin"
    public let jsName = "ForwardDraftFilePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openTextFile", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var temporaryExportURL: URL?
    private var pickerPresented = false

    @objc func saveFile(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Another file operation is already open.")
            return
        }
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("Missing file name.")
            return
        }
        guard let base64 = call.getString("base64"), let data = Data(base64Encoded: base64) else {
            call.reject("Missing file data.")
            return
        }

        do {
            let safeName = name.replacingOccurrences(of: "/", with: "-")
            let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            try data.write(to: fileURL, options: .atomic)
            temporaryExportURL = fileURL
            pendingCall = call

            let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
            picker.delegate = self
            picker.modalPresentationStyle = .formSheet
            presentPicker(picker, call: call)
        } catch {
            call.reject("Could not prepare the file for saving.", nil, error)
            cleanup()
        }
    }

    @objc func openTextFile(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Another file operation is already open.")
            return
        }

        let extensions = (call.getArray("extensions", String.self) ?? [])
            .map { $0.replacingOccurrences(of: ".", with: "").lowercased() }
            .filter { !$0.isEmpty }
        let types = extensions.compactMap { UTType(filenameExtension: $0) }
        pendingCall = call

        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types.isEmpty ? [.data] : types, asCopy: true)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        picker.modalPresentationStyle = .formSheet
        presentPicker(picker, call: call)
    }

    private func presentPicker(_ picker: UIDocumentPickerViewController, call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("File picker is unavailable.")
                return
            }
            guard let viewController = self.bridge?.viewController else {
                call.reject("File picker is unavailable.")
                self.cleanup()
                return
            }
            self.pickerPresented = false
            viewController.present(picker, animated: true) {
                self.pickerPresented = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                guard let self, self.pendingCall != nil, !self.pickerPresented else {
                    return
                }
                call.reject("File picker did not open.")
                self.cleanup()
            }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingCall?.reject("cancelled", "cancelled")
        cleanup()
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingCall else {
            cleanup()
            return
        }

        if let temporaryExportURL {
            call.resolve([
                "name": temporaryExportURL.lastPathComponent,
                "status": "saved"
            ])
            cleanup()
            return
        }

        guard let url = urls.first else {
            call.reject("No file was selected.")
            cleanup()
            return
        }

        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
                call.reject("The selected file is not readable text.")
                cleanup()
                return
            }
            call.resolve([
                "name": url.lastPathComponent,
                "text": text
            ])
        } catch {
            call.reject("Could not read the selected file.", nil, error)
        }
        cleanup()
    }

    private func cleanup() {
        if let temporaryExportURL {
            try? FileManager.default.removeItem(at: temporaryExportURL)
        }
        temporaryExportURL = nil
        pendingCall = nil
        pickerPresented = false
    }
}
