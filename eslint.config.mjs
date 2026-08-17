import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
	{ ignores: ["node_modules/**", "build/**", "main.js"] },
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { "args": "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
		},
	},
	{
		// obsidian ships types only (no runtime), so `instanceof TFile` can't
		// narrow a test fixture the way the rule expects — a shape cast is the
		// only way to build one, per this repo's no-mocking test convention.
		files: ["**/*.test.ts"],
		rules: {
			"obsidianmd/no-tfile-tfolder-cast": "off",
		},
	},
]);
