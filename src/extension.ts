import * as vscode from 'vscode';
import * as os from 'os';
import * as fs from "fs";
import * as path from 'path';
import * as cpp from 'vscode-cpptools';
import { execSync } from "child_process";

export type CStd = "c89" | "c99" | "c11" | "c17" | "c++98" | "c++03" | "c++11" | "c++14" | "c++17" | "c++20" | "c++23" | "gnu89" | "gnu99" | "gnu11" | "gnu17" | "gnu++98" | "gnu++03" | "gnu++11" | "gnu++14" | "gnu++17" | "gnu++20" | "gnu++23";

export interface MakeConfiguration {
	name: string;
	cStandard?: CStd;
	cppStandard?: CStd;
	includePath?: string[];
	defines?: string[];
	compilerPath?: string;
}

export interface PathSettings {
	linux: string[];
	windows: string[];
};

let _activeConfigNameStatusBarItem: vscode.StatusBarItem;

let _activeConfigName: string | undefined;
let _cppConfigs: MakeConfiguration[] | undefined;
// let _defines: RegExp | string | undefined;
// let _includes: RegExp | string | undefined;
let _toolPrefix: string;
let _сompilerPath: string | undefined;
let _toolVersion: string;
let _makeString: string;
let _fillCompilerPath: boolean | undefined;
let _printLog: boolean | undefined;
let _paths: PathSettings | undefined;

export function getConfigInstance(name: string): MakeConfiguration | undefined {
	if (_cppConfigs === undefined) { return undefined; }

	return _cppConfigs.find(c => c.name === name);
}


export class CppConfigurationProvider implements cpp.CustomConfigurationProvider {
	public readonly name = 'Makefile to C/C++ config';
	public readonly extensionId = 'ZaikinDenis.make-to-cpp-props';

	private workspaceBrowseConfiguration: cpp.WorkspaceBrowseConfiguration = { browsePath: [] };

	private dropNulls<T>(items: (T | null | undefined)[]): T[] {
		return items.filter(item => (item !== null && item !== undefined)) as T[];
	}

	private getConfiguration(uri: vscode.Uri): cpp.SourceFileConfigurationItem | undefined {
		const folders = vscode.workspace.workspaceFolders;


		if (uri === null || uri === undefined || uri.scheme !== 'file' || folders === undefined) {
			return undefined;
		};


		const folder0 = folders[0].uri.fsPath;

		if (_activeConfigName === undefined) { return undefined; }

		const activeConfig = getConfigInstance(_activeConfigName);
		if (activeConfig === undefined) { return undefined; }

		const configuration: cpp.SourceFileConfiguration = {
			includePath: [`${activeConfig.compilerPath ?? _сompilerPath}/../${_toolPrefix}/include`, ...(activeConfig.includePath?.map(i => path.join(folder0, i)) ?? [])],

			defines: [...(activeConfig?.defines ?? [])],
			standard: activeConfig.cStandard,
			intelliSenseMode: "gcc-arm",
			compilerPath: activeConfig.compilerPath ?? _сompilerPath,
		};


		const cppconf = {
			uri,
			configuration
		};

		loger(cppconf);

		return cppconf;
	}

	//------------------------------------------

	public async canProvideConfiguration(uri: vscode.Uri): Promise<boolean> {
		return true;
	}
	public async provideConfigurations(uris: vscode.Uri[]): Promise<cpp.SourceFileConfigurationItem[]> {
		return this.dropNulls(uris.map(uri => this.getConfiguration(uri)));
	}


	public async canProvideBrowseConfiguration(): Promise<boolean> {
		return this.workspaceBrowseConfiguration.browsePath.length > 0;
	}
	public async canProvideBrowseConfigurationsPerFolder(): Promise<boolean> {
		return false;
	}
	public async provideFolderBrowseConfiguration(_uri: vscode.Uri): Promise<cpp.WorkspaceBrowseConfiguration> {
		return this.workspaceBrowseConfiguration;
	}
	public async provideBrowseConfiguration(): Promise<cpp.WorkspaceBrowseConfiguration> {
		return this.workspaceBrowseConfiguration;
	}

	public dispose(): void { }
}


let cppConfigurationProvider = new CppConfigurationProvider();
let api: cpp.CppToolsApi | undefined;


function getConfigs() {

	_printLog = getConfigValue<boolean>(" debug.console-log");

	_cppConfigs = getConfigValue<MakeConfiguration[]>("configurations");
	_activeConfigName = getConfigValue<string>("activeConfigName");


	if (!_activeConfigName) {
		if (_cppConfigs === undefined) { _activeConfigName = undefined; }
		else {
			updateActiveConfigName(_cppConfigs[0].name);
			_activeConfigName = _cppConfigs[0].name;
		}
	}

	// _defines = getConfigValue<string | RegExp>("defines-regexp");
	// _includes = getConfigValue<string | RegExp>("includes-regexp");

	_toolPrefix = getConfigValue<string>('toolchainPrefix') ?? "arm-none-eabi";

	_toolVersion = getConfigValue<string>('toolchainVersion') ?? "8.1.0";

	_fillCompilerPath = getConfigValue<boolean>("generator.fillCompilerPath");
	_сompilerPath = getConfigValue<string>("generator.CompilerPath");

	_makeString = getConfigValue<string>("generator.make") ?? "make";

	_paths = getConfigValue("path");
}

export async function activate(context: vscode.ExtensionContext) {
	const registerCppTools = async (): Promise<void> => {
		if (!api) {
			api = await cpp.getCppToolsApi(cpp.Version.v6);
		}

		if (api) {
			api.registerCustomConfigurationProvider(cppConfigurationProvider);

			if (api.notifyReady) {
				api.notifyReady(cppConfigurationProvider);
			} else {
				api.didChangeCustomConfiguration(cppConfigurationProvider);
			}
		}
	};


	await registerCppTools();
	getConfigs();


	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.createConfig', async (item) => createConfig(context, item)));
	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.activeConfigName', () => _activeConfigName));
	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.setActiveConfigName', setActiveConfigName));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(getConfigs));


	_activeConfigNameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	_activeConfigNameStatusBarItem.command = 'make-to-cpp-props.setActiveConfigName';
	_activeConfigNameStatusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
	_activeConfigNameStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

	updateActiveConfigName(_activeConfigName ?? 'undefined', false);

	_activeConfigNameStatusBarItem.show();
	context.subscriptions.push(_activeConfigNameStatusBarItem);
}


function updateActiveConfigName(confName: string, update: boolean = true) {
	if (update) { vscode.workspace.getConfiguration().update("make-to-cpp-props.activeConfigName", confName); }
	_activeConfigNameStatusBarItem.text = `$(code) Active config: ${confName}`;
}


async function setActiveConfigName() {
	const names: string[] = _cppConfigs?.map(c => c.name) ?? [];

	const result = await vscode.window.showQuickPick(names, { canPickMany: false });

	if (result) {
		updateActiveConfigName(result);
	}
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

			if (config) {
				await cppConfigSave(item, config);
				loger("Done");
			}
		}
		else {
			vscode.window.showWarningMessage('Makefiles not found', { modal: true });
		}
	});
}


async function cppConfigSave(item: vscode.Uri, config: MakeConfiguration) {

	const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri;
	if (rootPath) {

		const vscodeConfig = vscode.Uri.joinPath(rootPath, '.vscode');
		if (!fs.existsSync(vscodeConfig.fsPath)) {
			await vscode.workspace.fs.createDirectory(vscodeConfig);
		}


		const selectedConfig = getConfigInstance(config.name);


		if (selectedConfig) {
			Object.assign(_cppConfigs?.find(i => i.name === config.name) ?? {}, config);
		}
		else {
			_cppConfigs?.push(config);
		}

		vscode.workspace.getConfiguration().update("make-to-cpp-props.configurations", _cppConfigs);
	}
}


function createToolchain({ extensionUri }: vscode.ExtensionContext): string {
	const binName = (os.type() === "Windows_NT") ? "windows.exe" : "linux";

	const toolName = `${_toolPrefix}-gcc`;
	const toolchain = vscode.Uri.joinPath(extensionUri, "bin", _toolVersion, toolName);

	loger("binName", binName);
	loger("toolchain", toolchain);

	try {
		if (!fs.existsSync(toolchain.path)) {
			const toolBin = vscode.Uri.joinPath(extensionUri, "bin", binName);
			vscode.workspace.fs.copy(toolBin, toolchain, { overwrite: true });
			vscode.workspace.fs.writeFile(vscode.Uri.joinPath(extensionUri, "bin", _toolVersion, "version.cfg"), new TextEncoder().encode(_toolVersion));
		}
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
	}

	return toolName;
}


async function cppConfigMake({ extensionPath }: vscode.ExtensionContext, item: vscode.Uri, toolchain: string): Promise<MakeConfiguration | undefined> {
	let separator: string;
	let paths: string[] = [];

	if (os.type() === "Windows_NT") {
		separator = ";";
		paths = _paths?.windows ?? [];
	}
	else {
		separator = ":";
		paths = _paths?.linux ?? [];
	}

	loger("make", _makeString);

	const envPath = [`${extensionPath}/bin/${_toolVersion}`, ...paths, process.env.PATH].join(separator);
	try {
		execSync(_makeString, {
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
	if (fs.existsSync(output.fsPath)) {
		const doc = await vscode.workspace.openTextDocument(output);
		const compilelog = doc.getText();
		vscode.workspace.fs.delete(output);

		const defMatchRegex: RegExp = RegExp(/-D\s?([\w\d]+=[\w\d]+|[\w\d]+="[\w\d\s :,\.\/\-]+"|[\w\d]+)/g);
		const incMatchRegex: RegExp = RegExp(/\s?-I\s?"?([.\S\w]*)"?/g);

		const stdCMatch = compilelog.matchAll(/\s?\-std=([cgnu]*[\dx]{2})\s?/g);
		const stdCppMatch = compilelog.matchAll(/\s?\-std=([cgnu]*\+{2}\d{1,2}\w?)\s?/g);
		const defMatch = compilelog.matchAll(defMatchRegex);
		const incMatch = compilelog.matchAll(incMatchRegex);

		const config = path.basename(item.fsPath);
		let cStandard = Array.from(stdCMatch, m => m[1] as string)?.[0];
		const cppStandard = Array.from(stdCppMatch, m => m[1] as string)?.[0];
		const defines = new Set(Array.from(defMatch, m => m[1] as string));
		const includes = new Set(Array.from(incMatch, m => m[1] as string));

		const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri.fsPath || ".";
		const makePath = vscode.workspace.asRelativePath(item, false);

		loger("rootPath", rootPath);
		loger("makePath", makePath);

		const getPathWork = (item: string) => getPathFromWorkspace(makePath, item);

		const conf: MakeConfiguration = {
			name: config,
			includePath: [...includes].sort().map(inc => getPathWork(inc)),
			defines: [...defines],
		};


		if (cStandard === 'c2x') { cStandard = "c23"; }


		conf.cStandard ??= cStandard as CStd;
		conf.cppStandard ??= cppStandard as CStd;

		if (_fillCompilerPath && toolchain.endsWith("gcc")) {
			const sysroot = execSync(`${toolchain} -print-sysroot 2>&1`).toString();

			loger("sysroot", sysroot);

			if (sysroot) {
				conf.compilerPath = getPathWork(path.join(sysroot, toolchain));
			}
		}
		return conf;
	}

	return undefined;
}


function getPathFromWorkspace(makePath: string, item: string): string {
	const value = `${makePath}/${item}`;
	loger(value);
	return value;
}


function getConfigValue<T>(key: string): T | undefined {
	const value = vscode.workspace.getConfiguration().get<T>(`make-to-cpp-props.${key}`);
	loger(key, value ?? "undefined");
	return value;
}


function loger(...result: any[]) {
	if (vscode.workspace.getConfiguration().get("make-to-cpp-props.debug.console-log") ?? true) { console.log(...result); }
}