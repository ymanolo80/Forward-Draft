import Capacitor
import UIKit
import UniformTypeIdentifiers

@objc(ForwardDraftFilePlugin)
public class ForwardDraftFilePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "ForwardDraftFilePlugin"
    public let jsName = "ForwardDraftFilePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createTextFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveTextFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openTextFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTextFileInfo", returnType: CAPPluginReturnPromise)
    ]

    private enum PendingOperation {
        case saveCopy(URL)
        case createProject(URL)
        case open
    }

    private struct StoredFileReference: Codable {
        let bookmark: String?
        let url: String?
    }

    private var pendingCall: CAPPluginCall?
    private var pendingOperation: PendingOperation?
    private var pickerPresented = false

    @objc func saveFile(_ call: CAPPluginCall) {
        prepareExport(call: call, asCopy: true)
    }

    @objc func createTextFile(_ call: CAPPluginCall) {
        prepareExport(call: call, asCopy: false)
    }

    @objc func saveTextFile(_ call: CAPPluginCall) {
        guard pendingCall == nil else {
            call.reject("Another file operation is already open.")
            return
        }
        guard let fileRef = call.getString("fileRef"), let bookmarkData = Data(base64Encoded: fileRef) else {
            call.reject("Missing file reference.")
            return
        }
        guard let base64 = call.getString("base64"), let data = Data(base64Encoded: base64) else {
            call.reject("Missing file data.")
            return
        }

        do {
            let resolved = try resolveFileReference(fileRef, fallbackBookmarkData: bookmarkData)
            try writeCoordinated(data, to: resolved.url)
            call.resolve([
                "name": resolved.url.lastPathComponent,
                "status": "saved",
                "fileRef": resolved.stale ? try makeBookmark(for: resolved.url) : fileRef,
                "modifiedAt": try modifiedAt(for: resolved.url)
            ])
        } catch {
            call.reject("Could not save the project file.", nil, error)
        }
    }

    @objc func getTextFileInfo(_ call: CAPPluginCall) {
        guard let fileRef = call.getString("fileRef"), let bookmarkData = Data(base64Encoded: fileRef) else {
            call.reject("Missing file reference.")
            return
        }

        do {
            let resolved = try resolveFileReference(fileRef, fallbackBookmarkData: bookmarkData)
            let data = try readCoordinated(from: resolved.url)
            guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
                call.reject("The selected file is not readable text.")
                return
            }
            call.resolve([
                "name": resolved.url.lastPathComponent,
                "text": text,
                "fileRef": resolved.stale ? try makeBookmark(for: resolved.url) : fileRef,
                "modifiedAt": try modifiedAt(for: resolved.url)
            ])
        } catch {
            call.reject("Could not read the project file.", nil, error)
        }
    }

    private func prepareExport(call: CAPPluginCall, asCopy: Bool) {
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
            pendingOperation = asCopy ? .saveCopy(fileURL) : .createProject(fileURL)
            pendingCall = call

            let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: asCopy)
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
        pendingOperation = .open

        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types.isEmpty ? [.data] : types, asCopy: false)
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

        guard let operation = pendingOperation else {
            call.reject("No file operation is pending.")
            cleanup()
            return
        }

        if case let .saveCopy(temporaryExportURL) = operation {
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

        if case .createProject = operation {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer {
                if didAccess {
                    url.stopAccessingSecurityScopedResource()
                }
            }
            do {
                call.resolve([
                    "name": url.lastPathComponent,
                    "status": "saved",
                    "fileRef": try makeBookmark(for: url),
                    "modifiedAt": try modifiedAt(for: url)
                ])
            } catch {
                call.reject("Could not remember the project file.", nil, error)
            }
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
            let data = try readCoordinated(from: url)
            guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .utf16) else {
                call.reject("The selected file is not readable text.")
                cleanup()
                return
            }
            call.resolve([
                "name": url.lastPathComponent,
                "text": text,
                "fileRef": try makeBookmark(for: url),
                "modifiedAt": try modifiedAt(for: url)
            ])
        } catch {
            call.reject("Could not read the selected file.", nil, error)
        }
        cleanup()
    }

    private func resolveFileReference(_ fileRef: String, fallbackBookmarkData: Data) throws -> (url: URL, stale: Bool) {
        if
            let envelopeData = Data(base64Encoded: fileRef),
            let reference = try? JSONDecoder().decode(StoredFileReference.self, from: envelopeData)
        {
            if let bookmark = reference.bookmark, let bookmarkData = Data(base64Encoded: bookmark) {
                var stale = false
                let url = try URL(
                    resolvingBookmarkData: bookmarkData,
                    options: [],
                    relativeTo: nil,
                    bookmarkDataIsStale: &stale
                )
                return (url, stale)
            }
            if let urlString = reference.url, let url = URL(string: urlString) {
                return (url, false)
            }
        }

        var stale = false
        let url = try URL(
            resolvingBookmarkData: fallbackBookmarkData,
            options: [],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        )
        return (url, stale)
    }

    private func readCoordinated(from url: URL) throws -> Data {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        var coordinationError: NSError?
        var readResult: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
            readResult = Result {
                try Data(contentsOf: coordinatedURL)
            }
        }
        if let coordinationError {
            throw coordinationError
        }
        return try readResult?.get() ?? Data(contentsOf: url)
    }

    private func writeCoordinated(_ data: Data, to url: URL) throws {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                url.stopAccessingSecurityScopedResource()
            }
        }

        var coordinationError: NSError?
        var writeResult: Result<Void, Error>?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { coordinatedURL in
            writeResult = Result {
                try data.write(to: coordinatedURL, options: .atomic)
            }
        }
        if coordinationError != nil {
            try writeDirect(data, to: url)
        } else {
            do {
                try writeResult?.get()
            } catch {
                try writeDirect(data, to: url)
            }
        }

        let writtenData = try readCoordinated(from: url)
        guard writtenData == data else {
            throw NSError(
                domain: "ForwardDraftFilePlugin",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "The file did not contain the saved project data after writing."]
            )
        }
    }

    private func writeDirect(_ data: Data, to url: URL) throws {
        do {
            try data.write(to: url, options: [])
        } catch {
            try data.write(to: url, options: .atomic)
        }
    }

    private func makeBookmark(for url: URL) throws -> String {
        let bookmark = try url.bookmarkData(
            options: [],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        let reference = StoredFileReference(
            bookmark: bookmark.base64EncodedString(),
            url: url.absoluteString
        )
        return try JSONEncoder().encode(reference).base64EncodedString()
    }

    private func modifiedAt(for url: URL) throws -> Double {
        let values = try url.resourceValues(forKeys: [.contentModificationDateKey])
        return (values.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000
    }

    private func cleanup() {
        if case let .saveCopy(temporaryExportURL) = pendingOperation {
            try? FileManager.default.removeItem(at: temporaryExportURL)
        }
        pendingOperation = nil
        pendingCall = nil
        pickerPresented = false
    }
}
