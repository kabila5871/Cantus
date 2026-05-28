import * as monaco from "monaco-editor";

export function defineCantusDarkTheme() {
  monaco.editor.defineTheme("cantus-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0e1014",
      "editorGutter.background": "#0e1014",
      "minimap.background": "#0e1014",
      "editorLineNumber.foreground": "#454b57",
      "editor.selectionBackground": "#e0855f33",
    },
  });
}
