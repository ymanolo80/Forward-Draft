import type { Project, SceneVersion, ScriptElement } from "../types";
import { parseScreenplayText, stripInlineFountain } from "./screenplay";

const sceneHeadingPattern = /^(?:INT|EXT|EST|I\/E|INT\/EXT|EXT\/INT|INT\.\/EXT|EXT\.\/INT)[\s./]/i;
const scenePrefixes = ["INT.", "EXT.", "INT./EXT.", "EXT./INT.", "EST."];
const sceneTimes = ["DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", "DAWN", "DUSK", "CONTINUOUS", "LATER", "MOMENTS LATER"];
const starterLocations = ["WRITING ROOM", "CITY STREET", "KITCHEN", "OFFICE", "CAR"];
const standardTransitions = ["CUT TO:", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "FADE IN:", "FADE OUT.", "BACK TO:", "INTERCUT WITH:"];
const standardParentheticals = ["(beat)", "(pause)", "(quietly)", "(whispering)", "(to himself)", "(to herself)", "(into phone)", "(CONT'D)", "(then)"];

function likelyCharacterName(line: string) {
  const value = stripInlineFountain(line.trim());
  if (!value || value.length > 48 || !/\p{Lu}/u.test(value)) return false;
  if (value !== value.toUpperCase()) return false;
  if (sceneHeadingPattern.test(value) || value.endsWith(":")) return false;
  if (value.startsWith("(") || value.startsWith(">") || value.startsWith("#") || value.startsWith("[[")) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N} .,'’()\-]*$/u.test(value);
}

export function projectCharacterNames(project: Project, versions: SceneVersion[]) {
  const names = new Set<string>();
  project.drafts
    .filter((block) => block.element === "Character")
    .forEach((block) => {
      const name = block.text.trim().toUpperCase();
      if (name) names.add(name);
    });

  const currentVersionIds = new Set(project.scenes.map((scene) => scene.currentVersionId));
  versions
    .filter((version) => currentVersionIds.has(version.versionId))
    .forEach((version) => {
      parseScreenplayText(version.text)
        .filter((block) => block.element === "Character")
        .forEach((block) => {
          const name = stripInlineFountain(block.text.trim()).toUpperCase();
          if (name) names.add(name);
        });
      version.text
        .split(/\r?\n/)
        .filter(likelyCharacterName)
        .forEach((name) => names.add(stripInlineFountain(name.trim()).toUpperCase()));
    });

  return [...names].sort((a, b) => a.localeCompare(b));
}

export function characterNameSuggestions(text: string, project: Project, versions: SceneVersion[]) {
  const query = stripInlineFountain(text.trim()).toUpperCase();
  return projectCharacterNames(project, versions)
    .filter((name) => !query || name.startsWith(query))
    .slice(0, 8);
}

function sceneLocations(project: Project) {
  const values = new Set<string>();
  const collect = (heading: string) => {
    const value = heading.toUpperCase();
    const prefix = scenePrefixes.find((item) => value.startsWith(item));
    if (!prefix) return;
    const withoutPrefix = value.slice(prefix.length).trim();
    const location = withoutPrefix.split(" - ")[0]?.trim();
    if (location) values.add(location);
  };
  project.scenes.forEach((scene) => collect(scene.heading));
  project.drafts.filter((block) => block.element === "Scene Heading").forEach((block) => collect(block.text));
  starterLocations.forEach((location) => values.add(location));
  return [...values].slice(0, 8);
}

function existingSceneHeadings(project: Project) {
  const values = new Set<string>();
  project.scenes.forEach((scene) => {
    const heading = stripInlineFountain(scene.heading.trim()).toUpperCase();
    if (heading) values.add(heading);
  });
  project.drafts
    .filter((block) => block.element === "Scene Heading")
    .forEach((block) => {
      const heading = stripInlineFountain(block.text.trim()).toUpperCase();
      if (heading) values.add(heading);
    });
  return [...values].sort((a, b) => a.localeCompare(b));
}

function uniqueSuggestions(values: string[]) {
  return [...new Set(values)].slice(0, 8);
}

export function sceneHeadingSuggestions(text: string, project: Project) {
  const value = text.toUpperCase();
  const existingMatches = existingSceneHeadings(project).filter((heading) => !value || heading.startsWith(value));
  const prefix = scenePrefixes.find((item) => value.startsWith(item));
  if (!prefix) return uniqueSuggestions([...existingMatches, ...scenePrefixes.filter((item) => item.startsWith(value))]).slice(0, 5);

  const hasSeparator = value.includes(" - ");
  if (!hasSeparator) {
    const locationText = value.slice(prefix.length).trim();
    const locations = sceneLocations(project).filter((location) => location.startsWith(locationText));
    if (locationText && locations.length === 0) return existingMatches.length ? existingMatches.slice(0, 5) : [`${value} - `];
    return uniqueSuggestions([...existingMatches, ...locations.map((location) => `${prefix} ${location} - `)]).slice(0, 5);
  }

  const [beforeTime, timeText = ""] = value.split(" - ");
  return uniqueSuggestions([
    ...existingMatches,
    ...sceneTimes
    .filter((time) => time.startsWith(timeText.trim()))
    .map((time) => `${beforeTime} - ${time}`)
  ]).slice(0, 5);
}

function optionSuggestions(text: string, options: string[]) {
  const normalized = text.trim().toUpperCase().replace(/^\(/, "");
  return options
    .filter((option) => option.toUpperCase().replace(/^\(/, "").startsWith(normalized))
    .slice(0, 6);
}

export function screenplayElementSuggestions(
  element: ScriptElement,
  text: string,
  project: Project,
  versions: SceneVersion[],
) {
  if (element === "Scene Heading") return sceneHeadingSuggestions(text, project);
  if (element === "Character") return characterNameSuggestions(text, project, versions);
  if (element === "Transition") return optionSuggestions(text, standardTransitions);
  if (element === "Parenthetical") return optionSuggestions(text, standardParentheticals);
  return [];
}
