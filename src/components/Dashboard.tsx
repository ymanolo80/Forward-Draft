import type { AppData, Project } from "../types";
import { createProject } from "../lib/seed";
import { createId, nowIso } from "../lib/ids";
import { exportProjectFile } from "../lib/exports";
import { readTextFile } from "../lib/fileService";
import { openProjectFileIntoData } from "../lib/projectIO";

interface DashboardProps {
  data: AppData;
  setData: (next: AppData) => void;
  activeProject?: Project;
}

export function Dashboard({ data, setData, activeProject }: DashboardProps) {
  const createNew = () => {
    const created = createProject("New Forward Draft");
    setData({
      ...data,
      projects: [...data.projects, ...created.projects],
      versions: [...data.versions, ...created.versions],
      notes: [...data.notes, ...created.notes],
      highlights: [...data.highlights, ...created.highlights],
      tasks: [...data.tasks, ...created.tasks],
      activeProjectId: created.activeProjectId,
    });
  };

  const rename = () => {
    if (!activeProject) return;
    const title = prompt("Project title", activeProject.title)?.trim();
    if (!title) return;
    setData({
      ...data,
      projects: data.projects.map((project) =>
        project.projectId === activeProject.projectId ? { ...project, title, updatedAt: nowIso() } : project,
      ),
    });
  };

  const duplicate = () => {
    if (!activeProject) return;
    const projectId = createId("project");
    const sceneIdMap = new Map<string, string>();
    const versionIdMap = new Map<string, string>();
    const noteIdMap = new Map<string, string>();
    const scenes = activeProject.scenes.map((scene) => {
      const sceneId = createId("scene");
      sceneIdMap.set(scene.sceneId, sceneId);
      return { ...scene, sceneId, projectId };
    });
    const versions = data.versions
      .filter((version) => sceneIdMap.has(version.sceneId))
      .map((version) => {
        const versionId = createId("version");
        versionIdMap.set(version.versionId, versionId);
        return { ...version, versionId, sceneId: sceneIdMap.get(version.sceneId)! };
      });
    const notes = data.notes
      .filter((note) => sceneIdMap.has(note.sceneId))
      .map((note) => {
        const noteId = createId("note");
        noteIdMap.set(note.noteId, noteId);
        return {
          ...note,
          noteId,
          sceneId: sceneIdMap.get(note.sceneId)!,
          versionId: versionIdMap.get(note.versionId) ?? note.versionId,
        };
      });
    const highlights = data.highlights
      .filter((highlight) => sceneIdMap.has(highlight.sceneId))
      .map((highlight) => ({
        ...highlight,
        highlightId: createId("highlight"),
        sceneId: sceneIdMap.get(highlight.sceneId)!,
        versionId: versionIdMap.get(highlight.versionId) ?? highlight.versionId,
        noteId: highlight.noteId ? noteIdMap.get(highlight.noteId) : undefined,
      }));
    const tasks = data.tasks
      .filter((task) => sceneIdMap.has(task.sceneId))
      .map((task) => ({
        ...task,
        taskId: createId("task"),
        sceneId: sceneIdMap.get(task.sceneId)!,
        sourceVersionId: versionIdMap.get(task.sourceVersionId) ?? task.sourceVersionId,
        linkedNoteIds: task.linkedNoteIds.map((id) => noteIdMap.get(id) ?? id),
      }));
    const now = nowIso();
    const project = {
      ...activeProject,
      projectId,
      title: `${activeProject.title} Copy`,
      scenes: scenes.map((scene) => ({
        ...scene,
        currentVersionId: versionIdMap.get(scene.currentVersionId) ?? scene.currentVersionId,
      })),
      createdAt: now,
      updatedAt: now,
    };
    setData({
      ...data,
      projects: [...data.projects, project],
      versions: [...data.versions, ...versions],
      notes: [...data.notes, ...notes],
      highlights: [...data.highlights, ...highlights],
      tasks: [...data.tasks, ...tasks],
      activeProjectId: projectId,
    });
  };

  const deleteActive = () => {
    if (!activeProject || !confirm(`Delete "${activeProject.title}"?`)) return;
    const sceneIds = new Set(activeProject.scenes.map((scene) => scene.sceneId));
    const projects = data.projects.filter((project) => project.projectId !== activeProject.projectId);
    setData({
      projects,
      versions: data.versions.filter((version) => !sceneIds.has(version.sceneId)),
      notes: data.notes.filter((note) => !sceneIds.has(note.sceneId)),
      highlights: data.highlights.filter((highlight) => !sceneIds.has(highlight.sceneId)),
      tasks: data.tasks.filter((task) => !sceneIds.has(task.sceneId)),
      activeProjectId: projects[0]?.projectId,
    });
  };

  const openProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      const source = await readTextFile(file);
      const result = openProjectFileIntoData(data, source);
      setData(result.data);
      if (result.importedAsCopy) {
        alert(`Opened "${result.originalTitle}" as "${result.title}" because that project already exists here.`);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "This project file could not be opened.");
    }
  };

  return (
    <aside className="dashboard">
      <div>
        <p className="eyebrow">Projects</p>
        <h1>Forward Draft</h1>
      </div>
      <select
        value={data.activeProjectId ?? ""}
        onChange={(event) => {
          setData({ ...data, activeProjectId: event.target.value });
          event.currentTarget.blur();
        }}
      >
        {data.projects.map((project) => (
          <option key={project.projectId} value={project.projectId}>
            {project.title}
          </option>
        ))}
      </select>
      <div className="dashboard-actions">
        <button onClick={createNew}>New</button>
        <button onClick={rename} disabled={!activeProject}>
          Rename
        </button>
        <button onClick={duplicate} disabled={!activeProject}>
          Duplicate
        </button>
        <button onClick={deleteActive} disabled={!activeProject}>
          Delete
        </button>
        <button onClick={async () => activeProject && exportProjectFile(activeProject, data)} disabled={!activeProject}>
          Save Project File
        </button>
        <label className="file-button">
          Open Project File
          <input
            type="file"
            accept=".frdx"
            onChange={(event) => {
              openProjectFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>
    </aside>
  );
}
