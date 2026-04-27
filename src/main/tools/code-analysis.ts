import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type {
  CodeDiagnostic,
  CodeDiagnosticsDetails,
  CodeExportSummary,
  CodeImportSummary,
  CodeInspectDetails,
  CodeSymbolKind,
  CodeSymbolSummary,
} from "../../shared/contracts.js";
import { isPathAllowed, isPathForbiddenRead } from "../security.js";
import {
  isTextFile,
  resolveWorkspacePath,
  toRelativeWorkspacePath,
} from "./fs-utils.js";

const inspectParameters = Type.Object({
  path: Type.String({ description: "要分析的 TS/TSX/JS/JSX 文件路径" }),
});

const diagnosticsParameters = Type.Object({
  paths: Type.Array(Type.String({ description: "要诊断的文件路径" }), {
    description: "目标文件列表。默认用于本轮相关文件，不做全仓扫描。",
  }),
  mode: Type.Optional(
    Type.Union([Type.Literal("auto"), Type.Literal("typescript")], {
      description: "诊断模式，默认 auto。",
    }),
  ),
});

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const MAX_DIAGNOSTICS = 80;

function languageForPath(filePath: string): CodeInspectDetails["language"] {
  switch (path.extname(filePath).toLowerCase()) {
    case ".ts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
      return "javascript";
    case ".jsx":
      return "jsx";
    default:
      return "unknown";
  }
}

function scriptKindForPath(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function isSupportedSourceFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function emptyInspectDetails(reqPath: string): CodeInspectDetails {
  return {
    path: reqPath,
    language: "unknown",
    imports: [],
    exports: [],
    symbols: [],
    diagnostics: [],
  };
}

function emptyDiagnosticsDetails(
  mode: "auto" | "typescript",
  filesChecked: string[] = [],
): CodeDiagnosticsDetails {
  return {
    mode,
    filesChecked,
    diagnostics: [],
    errorCount: 0,
    warningCount: 0,
  };
}

function errorResult<TDetails>(details: TDetails, message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    details,
  };
}

function normalizeTargetFile(
  workspacePath: string,
  reqPath: string,
): { absolutePath: string; relativePath: string; error?: string } {
  const absolutePath = resolveWorkspacePath(workspacePath, reqPath);
  const relativePath = toRelativeWorkspacePath(workspacePath, absolutePath);

  if (!isPathAllowed(absolutePath, workspacePath)) {
    return { absolutePath, relativePath, error: `路径超出 workspace 范围: ${reqPath}` };
  }

  if (isPathForbiddenRead(absolutePath)) {
    return { absolutePath, relativePath, error: `该文件受敏感读取保护: ${reqPath}` };
  }

  if (!fs.existsSync(absolutePath)) {
    return { absolutePath, relativePath, error: `文件不存在: ${reqPath}` };
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return { absolutePath, relativePath, error: `${reqPath} 不是文件` };
  }

  if (!isTextFile(absolutePath)) {
    return { absolutePath, relativePath, error: `${reqPath} 不是可分析的文本文件` };
  }

  if (!isSupportedSourceFile(absolutePath)) {
    return { absolutePath, relativePath, error: `${reqPath} 不是 TS/TSX/JS/JSX 文件` };
  }

  return { absolutePath, relativePath };
}

function positionOf(sourceFile: ts.SourceFile, node: ts.Node) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: pos.line + 1,
    character: pos.character + 1,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function symbolKindForNode(node: ts.Node, name: string): CodeSymbolKind | null {
  if (ts.isFunctionDeclaration(node)) {
    return isComponentName(name) ? "component" : "function";
  }
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isVariableDeclaration(node)) {
    const initializer = node.initializer;
    if (
      isComponentName(name) &&
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) {
      return "component";
    }
    return "variable";
  }
  return null;
}

function collectBindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  return name.elements.flatMap((element) =>
    ts.isBindingElement(element) ? collectBindingNames(element.name) : [],
  );
}

function collectImports(sourceFile: ts.SourceFile): CodeImportSummary[] {
  const imports: CodeImportSummary[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const source = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : "";
    const names: string[] = [];
    const clause = statement.importClause;

    if (clause?.name) {
      names.push(clause.name.text);
    }
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        names.push(`* as ${clause.namedBindings.name.text}`);
      } else {
        for (const element of clause.namedBindings.elements) {
          names.push(element.name.text);
        }
      }
    }

    imports.push({
      source,
      names,
      line: positionOf(sourceFile, statement).line,
    });
  }

  return imports;
}

function collectExports(sourceFile: ts.SourceFile): CodeExportSummary[] {
  const exports: CodeExportSummary[] = [];

  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement)) {
      const named = "name" in statement && statement.name && ts.isIdentifier(statement.name)
        ? statement.name.text
        : ts.isVariableStatement(statement)
          ? statement.declarationList.declarations
            .flatMap((declaration) => collectBindingNames(declaration.name))
            .join(", ")
          : "default";
      exports.push({
        name: named || "default",
        kind: ts.SyntaxKind[statement.kind] ?? "export",
        line: positionOf(sourceFile, statement).line,
      });
    }

    if (ts.isExportDeclaration(statement)) {
      const names = statement.exportClause && ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.map((element) => element.name.text).join(", ")
        : "*";
      exports.push({
        name: names,
        kind: "export",
        line: positionOf(sourceFile, statement).line,
      });
    }

    if (ts.isExportAssignment(statement)) {
      exports.push({
        name: "default",
        kind: "export",
        line: positionOf(sourceFile, statement).line,
      });
    }
  }

  return exports;
}

function collectSymbols(sourceFile: ts.SourceFile): CodeSymbolSummary[] {
  const symbols: CodeSymbolSummary[] = [];

  const pushSymbol = (node: ts.Node, name: string, exported: boolean) => {
    const kind = symbolKindForNode(node, name);
    if (!kind) {
      return;
    }

    symbols.push({
      name,
      kind,
      line: positionOf(sourceFile, node).line,
      exported,
    });
  };

  for (const statement of sourceFile.statements) {
    const exported = hasExportModifier(statement);

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      pushSymbol(statement, statement.name.text, exported);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of collectBindingNames(declaration.name)) {
          pushSymbol(declaration, name, exported);
        }
      }
    }

    if (ts.isClassDeclaration(statement)) {
      const classExported = exported;
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) {
          continue;
        }
        const methodName = ts.isIdentifier(member.name)
          ? member.name.text
          : member.name.getText(sourceFile);
        pushSymbol(member, methodName, classExported || hasExportModifier(member));
      }
    }
  }

  return symbols.slice(0, 120);
}

function flattenDiagnosticMessage(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, "\n");
}

function severityOf(category: ts.DiagnosticCategory): CodeDiagnostic["severity"] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    case ts.DiagnosticCategory.Suggestion:
      return "suggestion";
    default:
      return "message";
  }
}

function normalizeDiagnostic(
  diagnostic: ts.Diagnostic,
  workspacePath: string,
): CodeDiagnostic {
  const filePath = diagnostic.file
    ? toRelativeWorkspacePath(workspacePath, diagnostic.file.fileName)
    : "";
  const pos =
    diagnostic.file && typeof diagnostic.start === "number"
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : { line: 0, character: 0 };

  return {
    filePath,
    line: pos.line + 1,
    character: pos.character + 1,
    code: String(diagnostic.code),
    severity: severityOf(diagnostic.category),
    message: flattenDiagnosticMessage(diagnostic.messageText),
  };
}

function getTsConfigPath(workspacePath: string, filePaths: string[]): string | null {
  const usesRenderer = filePaths.some((filePath) =>
    toRelativeWorkspacePath(workspacePath, filePath).startsWith("src/renderer/"),
  );
  const preferred = path.join(
    workspacePath,
    usesRenderer ? "tsconfig.renderer.json" : "tsconfig.json",
  );
  if (fs.existsSync(preferred)) {
    return preferred;
  }

  const fallback = path.join(workspacePath, "tsconfig.json");
  return fs.existsSync(fallback) ? fallback : null;
}

function readCompilerOptions(
  workspacePath: string,
  filePaths: string[],
): ts.CompilerOptions {
  const configPath = getTsConfigPath(workspacePath, filePaths);
  if (!configPath) {
    return {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      module: ts.ModuleKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      noEmit: true,
      skipLibCheck: true,
    };
  }

  const raw = ts.readConfigFile(configPath, ts.sys.readFile);
  if (raw.error) {
    return { noEmit: true, skipLibCheck: true };
  }

  const parsed = ts.parseJsonConfigFileContent(
    raw.config,
    ts.sys,
    path.dirname(configPath),
  );

  return {
    ...parsed.options,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
  };
}

function getDiagnosticsForFiles(
  workspacePath: string,
  filePaths: string[],
): CodeDiagnostic[] {
  const options = readCompilerOptions(workspacePath, filePaths);
  const program = ts.createProgram(filePaths, options);
  const targetSet = new Set(filePaths.map((filePath) => path.normalize(filePath)));
  const diagnostics: CodeDiagnostic[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (!targetSet.has(path.normalize(sourceFile.fileName))) {
      continue;
    }

    diagnostics.push(
      ...[
        ...program.getSyntacticDiagnostics(sourceFile),
        ...program.getSemanticDiagnostics(sourceFile),
      ].map((diagnostic) => normalizeDiagnostic(diagnostic, workspacePath)),
    );
  }

  return diagnostics.slice(0, MAX_DIAGNOSTICS);
}

function formatDiagnostics(diagnostics: CodeDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "未发现目标文件诊断问题。";
  }

  return diagnostics
    .slice(0, 20)
    .map(
      (diagnostic) =>
        `${diagnostic.filePath}:${diagnostic.line}:${diagnostic.character} ${diagnostic.severity} TS${diagnostic.code} ${diagnostic.message}`,
    )
    .join("\n");
}

export function createCodeInspectTool(
  workspacePath: string,
): AgentTool<typeof inspectParameters, CodeInspectDetails> {
  return {
    name: "code_inspect",
    label: "代码结构检查",
    description:
      "读取单个 TS/TSX/JS/JSX 文件的结构，返回 imports、exports、顶层符号和目标诊断，用于改代码前快速理解文件。",
    parameters: inspectParameters,
    async execute(_toolCallId, params) {
      const target = normalizeTargetFile(workspacePath, params.path);
      if (target.error) {
        return errorResult(emptyInspectDetails(params.path), target.error);
      }

      const text = fs.readFileSync(target.absolutePath, "utf-8");
      const sourceFile = ts.createSourceFile(
        target.absolutePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForPath(target.absolutePath),
      );
      const diagnostics = getDiagnosticsForFiles(workspacePath, [target.absolutePath]);
      const details: CodeInspectDetails = {
        path: target.relativePath,
        language: languageForPath(target.absolutePath),
        imports: collectImports(sourceFile),
        exports: collectExports(sourceFile),
        symbols: collectSymbols(sourceFile),
        diagnostics,
      };

      const textSummary = [
        `文件: ${target.relativePath}`,
        `语言: ${details.language}`,
        `imports: ${details.imports.length}`,
        `exports: ${details.exports.length}`,
        `symbols: ${details.symbols.length}`,
        `diagnostics: ${details.diagnostics.length}`,
        "",
        details.symbols.length > 0
          ? details.symbols
            .slice(0, 30)
            .map((symbol) => `- ${symbol.kind} ${symbol.name} @${symbol.line}${symbol.exported ? " exported" : ""}`)
            .join("\n")
          : "未发现顶层符号。",
        "",
        formatDiagnostics(details.diagnostics),
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: textSummary }],
        details,
      };
    },
  };
}

export function createCodeDiagnosticsTool(
  workspacePath: string,
): AgentTool<typeof diagnosticsParameters, CodeDiagnosticsDetails> {
  return {
    name: "code_diagnostics",
    label: "代码诊断",
    description:
      "对指定 TS/TSX/JS/JSX 文件做 TypeScript 目标诊断。适合 file_edit 后检查本轮相关文件。",
    parameters: diagnosticsParameters,
    async execute(_toolCallId, params) {
      const mode = params.mode ?? "auto";
      const targets = params.paths.map((reqPath) =>
        normalizeTargetFile(workspacePath, reqPath),
      );
      const files = targets.filter((target) => !target.error);
      const errors = targets
        .filter((target) => target.error)
        .map((target) => target.error);
      const filesChecked = files.map((file) => file.relativePath);

      if (files.length === 0) {
        return errorResult(
          emptyDiagnosticsDetails(mode),
          errors[0] ?? "paths 不能为空，且必须指向 TS/TSX/JS/JSX 文件。",
        );
      }

      const diagnostics = getDiagnosticsForFiles(
        workspacePath,
        files.map((file) => file.absolutePath),
      );
      const details: CodeDiagnosticsDetails = {
        mode,
        filesChecked,
        diagnostics,
        errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
        warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
      };
      const text = [
        `已检查 ${filesChecked.length} 个文件。`,
        errors.length > 0 ? `跳过 ${errors.length} 个无效路径：${errors.join("；")}` : "",
        `错误 ${details.errorCount}，警告 ${details.warningCount}。`,
        "",
        formatDiagnostics(diagnostics),
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text" as const, text }],
        details,
      };
    },
  };
}
