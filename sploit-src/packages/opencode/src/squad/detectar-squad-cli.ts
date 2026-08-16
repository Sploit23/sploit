import { detectarAreasProjeto } from "./detectar";
import * as path from "path";

const args = process.argv.slice(2);

if (args.length < 1 || !args.includes("--path")) {
  console.error("Uso: sploit detectar-squad --path <diretorio-do-projeto>");
  process.exit(1);
}

const projectPathArg = args[args.indexOf("--path") + 1];
const projectPath = path.resolve(projectPathArg);

if (!projectPath) {
  console.error("Por favor, forneça o caminho do projeto usando --path");
  process.exit(1);
}

try {
  const areas = detectarAreasProjeto(projectPath);
  console.log(JSON.stringify(areas, null, 2));
} catch (err) {
  console.error("Erro ao detectar áreas no projeto:", err);
  process.exit(1);
}