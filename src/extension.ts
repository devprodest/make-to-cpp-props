
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

	let disposable = vscode.commands.registerCommand('make-to-cpp-props.createConfig', async (item) => createConfig(context, item));

	context.subscriptions.push(disposable);
}


async function createConfig(context: vscode.ExtensionContext, item: vscode.Uri) {

	const toolchain = createToolchain(context);

	loger("item", item);

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

			loger("Done");
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

		loger("configFile", configFile);

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
	const toolName: string = getConfigValue('toolchainName') ?? "gcc";
	const toolVersion: string = getConfigValue('toolchainVersion') ?? "8.1.0";

	const binName = (os.type() === "Windows_NT") ? "windows.exe" : "linux";

	const toolchain = vscode.Uri.joinPath(extensionUri, "bin", toolVersion, toolName);

	loger("binName", binName);
	loger("toolchain", toolchain);

	try {
		if (!fs.existsSync(toolchain.path)) {
			const toolBin = vscode.Uri.joinPath(extensionUri, "bin", binName);
			vscode.workspace.fs.copy(toolBin, toolchain, { overwrite: true });
			vscode.workspace.fs.writeFile(vscode.Uri.joinPath(extensionUri, "bin", toolVersion, "version.cfg"), new TextEncoder().encode(toolVersion));
		}
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
	}

	return toolName;
}

async function cppConfigMake({ extensionPath }: vscode.ExtensionContext, item: vscode.Uri, toolchain: string): Promise<Configuration> {
	const separator = (os.type() === "Windows_NT") ? ";" : ":";

	const toolVersion: string = getConfigValue('toolchainVersion') ?? "8.1.0";
	const envPath = `${extensionPath}/bin/${toolVersion}/${separator}${process.env.PATH}`;
	try {
		const make = getConfigValue<string>("generator.make") ?? "make";
		execSync(make, {
			cwd: item.fsPath,
			env: {
				...process.env,
				["PATH"]: envPath
			}
		});
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
	}


	const output = vscode.Uri.joinPath(item, "output.txt");
	const doc = await vscode.workspace.openTextDocument(output);
	const compilelog = doc.getText();
	vscode.workspace.fs.delete(output);


	const _defines = getConfigValue<string>("defines-regex");
	const defMatchRegex: RegExp = RegExp(_defines ?? /\s?-D\s?([\w\=]*[\w\"\.]*)\s?/g);
	const _includes = getConfigValue<string>("includes-regex");
	const incMatchRegex: RegExp = RegExp(_includes ?? /\s?-I\s?"?([.\S\w]*)"?/g);

	const stdCMatch = compilelog.matchAll(/\s?\-std=([cgnu]*[\dx]{2})\s?/g);
	const stdCppMatch = compilelog.matchAll(/\s?\-std=([cgnu]*\+{2}\d{1,2}\w?)\s?/g);
	const defMatch = compilelog.matchAll(defMatchRegex);
	const incMatch = compilelog.matchAll(incMatchRegex);

	const config = path.basename(item.fsPath);
	const cStandard = Array.from(stdCMatch, m => m[1] as string)?.[0];
	const cppStandard = Array.from(stdCppMatch, m => m[1] as string)?.[0];
	const defines = new Set(Array.from(defMatch, m => m[1] as string));
	const includes = new Set(Array.from(incMatch, m => m[1] as string));

	const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri.fsPath || ".";
	const makePath = vscode.workspace.asRelativePath(item, false);

	loger("rootPath", rootPath);
	loger("makePath", makePath);

	const getPathWork = (item: string) => getPathFromWorkspace(makePath, item);

	const conf: Configuration = {
		name: config,
		includePath: [...includes].sort().map(inc => getPathWork(inc)),
		defines: [...defines],
	};

	conf.cStandard ??= cStandard;
	conf.cppStandard ??= cppStandard;


	if (getConfigValue("generator.compilerPath") && toolchain.endsWith("gcc")) {
		const sysroot = execSync(`${toolchain} -print-sysroot 2>&1`).toString();

		loger("sysroot", sysroot);

		if (sysroot) {
			conf.compilerPath = getPathWork(path.join(sysroot, toolchain));
		}
	}


	return conf;
}


function getPathFromWorkspace(makePath: string, item: string): string {
	const value = "${workspaceFolder}/" + `${makePath}/${item}`;
	loger(value);
	return value;
}

function modifyProps(cppProps: ConfigurationJson, config: Configuration) {
	const selestConf = cppProps.configurations.find(f => f.name === config.name);
	if (selestConf) { Object.assign(selestConf, config); }
	else {
		cppProps.configurations.push(config);
	}
}

function getConfigValue<T>(key: string): T | undefined {
	const value = vscode.workspace.getConfiguration().get<T>(`make-to-cpp-props.${key}`);
	loger(key, value ?? "undefined");
	return value;
}

function loger(...result: any[]) {
	if (vscode.workspace.getConfiguration().get("make-to-cpp-props.debug.console-log") ?? true) { console.log(...result); }
}