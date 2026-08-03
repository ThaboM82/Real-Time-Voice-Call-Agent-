import globals from "globals";
import pluginJs from "@eslint/js";
import nextPlugin from "eslint-config-next";

export default [
  // Backend (Node.js)
  {
    files: ["real-time-voice-agent/backend/**/*.js"],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "eqeqeq": "error",
      "curly": "error",
      "no-console": "off"
    },
  },

  // Frontend (Next.js + React)
  {
    files: ["real-time-voice-agent/frontend/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    extends: [nextPlugin],
    rules: {
      "react/jsx-uses-react": "off", // Next.js handles React import
      "react/react-in-jsx-scope": "off"
    },
  },

  // Base recommended rules
  pluginJs.configs.recommended,
];
