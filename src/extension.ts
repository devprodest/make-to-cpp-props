
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from "fs";
import * as path from 'path';
import { execSync } from "child_process";


export interface ConfigurationJson {
	configurations: Configuration[];
	env?: { [key: string]: string | string[] };
	version: 4;
}

export interface Configuration {
	name: string;
	compilerPath?: string;
	compilerArgs?: string[];
	cStandard?: string;
	cppStandard?: string;
	includePath?: string[];
	defines?: string[];
	intelliSenseMode?: string;
	compileCommands?: string;
	forcedInclude?: string[];
}

export function activate(context: vscode.ExtensionContext) {
	const toolchain = createToolchain(context);

	let disposable = vscode.commands.registerCommand('make-to-cpp-props.createConfig', async (item) => createConfig(context, item, toolchain));

	context.subscriptions.push(disposable);
}


async function createConfig(context: vscode.ExtensionContext, item: vscode.Uri, toolchain: string) {
	const options: vscode.ProgressOptions = {
		location: vscode.ProgressLocation.Notification,
		title: "Working"
	};

	vscode.window.withProgress(options, async () => {

		function isMakefile(file: string, ftype: vscode.FileType): boolean {
			const isfile = () => ftype === vscode.FileType.File;
			const isMakefile = () => file.endsWith(".mk") || ['GNUmakefile', 'makefile', 'Makefile'].includes(file);

			return isfile() && isMakefile();
		}

		const files = await vscode.workspace.fs.readDirectory(item);

		if (files.some(f => isMakefile(f[0], f[1]))) {

			const config = await cppConfigMake(context, item, toolchain);

			await cppConfigSave(item, config);

			vscode.window.showInformationMessage('Done');
		}
		else {
			vscode.window.showWarningMessage('Makefiles not found', { modal: true });
		}
	});
}


async function cppConfigSave(item: vscode.Uri, config: Configuration) {

	const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri;
	if (rootPath) {

		const vscodeConfig = vscode.Uri.joinPath(rootPath, '.vscode');
		if (!fs.existsSync(vscodeConfig.fsPath)) {
			await vscode.workspace.fs.createDirectory(vscodeConfig);
		}

		const configFile = path.resolve(rootPath.fsPath, '.vscode', "c_cpp_properties.json");

		let cppProps: ConfigurationJson = {
			version: 4,
			configurations: [],
		};

		if (!fs.existsSync(configFile)) {
			cppProps.configurations = [config];
		}
		else {
			cppProps = JSON.parse(fs.readFileSync(configFile, { encoding: 'utf8' }).toString());

			modifyProps(cppProps, config);
		}



		fs.writeFileSync(configFile, JSON.stringify(cppProps, undefined, 4), {
			encoding: 'utf8',
			flag: 'w'
		});
	}
}

function createToolchain({ extensionUri }: vscode.ExtensionContext): string {
	const toolName: string = vscode.workspace.getConfiguration().get('make-to-cpp-props.toolchainName') ?? "gcc";

	const binName = (os.type() === "Windows_NT") ? "windows" : "linux";
	const exeSufix = (os.type() === "Windows_NT") ? ".exe" : "";

	const toolchain = vscode.Uri.joinPath(extensionUri, "bin", toolName + exeSufix);

	try {
		if (!fs.existsSync(toolchain.path)) {
			const toolBin = vscode.Uri.joinPath(extensionUri, "bin", binName);
			vscode.workspace.fs.copy(toolBin, toolchain, { overwrite: true });
		}
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
	}

	return toolName;
}

async function cppConfigMake({ extensionPath }: vscode.ExtensionContext, item: vscode.Uri, toolchain: string): Promise<Configuration> {
	const separator = (os.type() === "Windows_NT") ? ";" : ":";

	try {
		execSync('make', {
			cwd: item.fsPath,
			env: {
				...process.env,
				["PATH"]: `${extensionPath}/bin${separator}${process.env.PATH}`
			}
		});
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
	}


	const output = vscode.Uri.joinPath(item, "output.txt");
	const doc = await vscode.workspace.openTextDocument(output);
	const compilelog = doc.getText();
	vscode.workspace.fs.delete(output);

	const stdCMatch = compilelog.matchAll(/\-std=([cgnu]*[\dx]{2})/g);
	const stdCppMatch = compilelog.matchAll(/\-std=([cgnu]*\+{2}\d{1,2}\w?)/g);
	const defMatch = compilelog.matchAll(/\s?-D([\w\=]*[\w\"\\\.]*)\s?/g);
	const incMatch = compilelog.matchAll(/\s?-I"?([.\S\w]*)"?/g);

	const config = path.basename(item.fsPath);
	const cStandard = Array.from(stdCMatch, m => m[1] as string)?.[0];
	const cppStandard = Array.from(stdCppMatch, m => m[1] as string)?.[0];
	const defines = new Set(Array.from(defMatch, m => m[1] as string));
	const includes = new Set(Array.from(incMatch, m => m[1] as string));

	const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri.fsPath || ".";
	const makePath = vscode.workspace.asRelativePath(item, false);

	const makeWinPath = path.relative(rootPath, makePath);

	const getPathWork = (item: string) => getPathFromWorkspace((os.type() === "Windows_NT") ? makeWinPath : makePath, item);

	const conf: Configuration = {
		name: config,
		includePath: [...includes].sort().map(inc => getPathWork(inc)),
		defines: [...defines],
		intelliSenseMode: 'gcc-arm',
	};

	conf.cStandard ??= cStandard;
	conf.cppStandard ??= cppStandard;


	// if (toolchain.endsWith("gcc")) {
	// 	const sysroot = execSync(`${toolchain} -print-sysroot 2>&1`).toString();
	// 	if (sysroot) {
	// 		conf.compilerPath = getPathWork(path.join(sysroot, toolchain));
	// 	}
	// }


	return conf;
}


function getPathFromWorkspace(makePath: string, item: string): string {
	return "${workspaceFolder}/" + path.join(makePath, item);
}

function modifyProps(cppProps: ConfigurationJson, config: Configuration) {
	const selestConf = cppProps.configurations.find(f => f.name === config.name);
	if (selestConf) { Object.assign(selestConf, config); }
	else {
		cppProps.configurations.push(config);
	}
}

