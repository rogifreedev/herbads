import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"]
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Neue react-hooks v6 Regeln aus eslint-config-next@16: bestehende Verstoesse
    // sind Altbestand und werden separat aufgeraeumt.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn"
    }
  }
];

export default eslintConfig;
