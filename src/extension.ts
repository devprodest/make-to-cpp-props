import * as vscode from 'vscode';
import { Utils } from 'vscode-uri'
import * as os from 'os';
import * as fs from "fs";
import * as cpp from 'vscode-cpptools';
import * as cp from "child_process";

//----------------------------------------------------------------------------------------------------------------------

export type CStd = "c89" | "c99" | "c11" | "c17" | "c++98" | "c++03" | "c++11" | "c++14" | "c++17" | "c++20" | "c++23" | "gnu89" | "gnu99" | "gnu11" | "gnu17" | "gnu++98" | "gnu++03" | "gnu++11" | "gnu++14" | "gnu++17" | "gnu++20" | "gnu++23";

export interface MakeConfiguration {
	name: string;
	cStandard?: CStd;
	cppStandard?: CStd;
	includePath?: string[];
	defines?: string[];
}

export interface PathSettings {
	linux?: string[];
	windows?: string[];
	all?: string[];
};

//----------------------------------------------------------------------------------------------------------------------

const defaultConfig: MakeConfiguration = {
	name: "default",
	cStandard: "c11",
	cppStandard: "c++11",
	includePath: [],
	defines: []
};

let activeConfigNameStatusBarItem: vscode.StatusBarItem;

let _activeConfigName: string;
let _cppConfigs: MakeConfiguration[] | undefined;

let logChannel: vscode.LogOutputChannel;

//----------------------------------------------------------------------------------------------------------------------

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


		const folder0 = folders[0].uri;

		if (_activeConfigName === undefined) { return undefined; }

		const activeConfig = getConfigInstance(_activeConfigName);
		if (activeConfig === undefined) { return undefined; }

		const configuration: cpp.SourceFileConfiguration = {
			includePath: [...(activeConfig.includePath?.map(i => Utils.joinPath(folder0, i).fsPath) ?? [])],

			defines: [...(activeConfig?.defines ?? [])],
			standard: activeConfig.cStandard,
			intelliSenseMode: "gcc-arm",
			compilerPath: getConfigValue<string>("generator.CompilerPath"),
		};


		const cppconf = {
			uri,
			configuration
		};

		logChannel.info("cpp config", cppconf);

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

//----------------------------------------------------------------------------------------------------------------------

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

export function getConfigInstance(name: string): MakeConfiguration | undefined {
	if (_cppConfigs === undefined) { return undefined; }

	return _cppConfigs.find(c => c?.name === name);
}


async function getConfigs(context: vscode.ExtensionContext) {
	_cppConfigs = getConfigValue<MakeConfiguration[]>("configurations");
	const activeConfig: string | undefined = context.globalState.get("activeConfigName");

	if (_cppConfigs && _cppConfigs.length !== 0) {
		if (!activeConfig || activeConfig?.length === 0) {
			_activeConfigName = _cppConfigs[0].name;
			updateActiveConfigName(context, _activeConfigName);
		}
		else { _activeConfigName = activeConfig };
	}
	else {
		vscode.workspace.getConfiguration().update("make-to-cpp-props.configurations", [defaultConfig]);
		_activeConfigName = "default";
		updateActiveConfigName(context, _activeConfigName);
	}
}


async function updateActiveConfigName(context: vscode.ExtensionContext, confName: string) {
	logChannel.info("Active config", confName);
	context.globalState.update("activeConfigName", confName);
	api?.didChangeCustomConfiguration(cppConfigurationProvider);
	await registerCppTools();
	await getConfigs(context);
	activeConfigNameStatusBarItem.text = `$(star-full) Active config: ${confName}`;
}


async function setActiveConfigName(context: vscode.ExtensionContext) {
	const names: string[] = _cppConfigs?.map(c => c?.name) ?? ["default"];
	const result = await vscode.window.showQuickPick(names, { canPickMany: false });
	if (result) {
		updateActiveConfigName(context, result);
	}
}


async function createConfig(context: vscode.ExtensionContext, item: vscode.Uri) {

	const toolchain = await createToolchain(context);

	logChannel.info("makefile", item);
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

		const selectedConfig = getConfigInstance(config.name);

		if (selectedConfig) {
			Object.assign(_cppConfigs?.find(i => i.name === config.name) ?? {}, config);
		}
		else {
			_cppConfigs?.push(config);
		}

		vscode.workspace.getConfiguration().update("make-to-cpp-props.configurations", _cppConfigs);
		logChannel.info("save config", "Done");
	}
}

//----------------------------------------------------------------------------------------------------------------------

async function createToolchain({ extensionUri }: vscode.ExtensionContext): Promise<string> {
	const binName = (os.type() === "Windows_NT") ? "windows.exe" : "linux";
	const toolName = getConfigValue<string>('generator.toolchainPath') ?? "arm-none-eabi-gcc";
	const toolVersion = getConfigValue<string>('generator.toolchainVersion') ?? "8.1.0";
	const toolchain: vscode.Uri = Utils.joinPath(extensionUri, "bin", toolVersion, toolName);
	try {
		if (!fs.existsSync(toolchain.path)) {
			const toolBin = Utils.joinPath(extensionUri, "bin", binName);
			vscode.workspace.fs.copy(toolBin, toolchain, { overwrite: true });
			vscode.workspace.fs.writeFile(Utils.joinPath(extensionUri, "bin", toolVersion, "version.cfg"), new TextEncoder().encode(toolVersion));
		}
	} catch (error) {
		vscode.window.showErrorMessage(error as string);
		logChannel.error("create toolchain", error);
	}

	return toolName;
}


async function cppConfigMake({ extensionPath }: vscode.ExtensionContext, item: vscode.Uri, toolchain: string): Promise<MakeConfiguration | undefined> {
	let separator: string;
	let paths: string[] = [];

	logChannel.info("os platform", os.platform());

	const _paths: PathSettings | undefined = getConfigValue("generator.env.path");

	if (os.platform() === 'win32' || os.type() === "Windows_NT") {
		separator = ";";
		paths = _paths?.windows ?? _paths?.all ?? [];
	}
	else {
		separator = ":";
		paths = _paths?.linux ?? _paths?.all ?? [];
	}

	const _toolVersion = getConfigValue<string>('generator.toolchainVersion') ?? "8.1.0";
	const envPath = [`${extensionPath}/bin/${_toolVersion}`, ...paths, process.env.PATH].join(separator);
	logChannel.info("env", envPath);

	const _makeString = getConfigValue<string>("generator.make") ?? "make";
	logChannel.info("make", _makeString);

	try {
		const compilelog = cp.execSync(_makeString, {
			cwd: item.fsPath,
			env: {
				...process.env,
				["PATH"]: envPath
			}
		}).toString().trim();

		const defMatchRegex: RegExp = RegExp(/-D\s?([\w\d]+=[\w\d]+|[\w\d]+="[\w\d\s :,\.\/\-]+"|[\w\d]+)/g);
		const incMatchRegex: RegExp = RegExp(/\s?-I\s?"?([.\S\w]*)"?/g);

		const stdCMatch = compilelog.matchAll(/\s?\-std=([cgnu]*[\dx]{2})\s?/g);
		const stdCppMatch = compilelog.matchAll(/\s?\-std=([cgnu]*\+{2}\d{1,2}\w?)\s?/g);
		const defMatch = compilelog.matchAll(defMatchRegex);
		const incMatch = compilelog.matchAll(incMatchRegex);

		const config = Utils.basename(item);
		let cStandard = Array.from(stdCMatch, m => m[1] as string)?.[0];
		const cppStandard = Array.from(stdCppMatch, m => m[1] as string)?.[0];
		const defines = new Set(Array.from(defMatch, m => m[1] as string));
		const includes = new Set(Array.from(incMatch, m => m[1] as string));

		const rootPath = vscode.workspace.getWorkspaceFolder(item)?.uri.fsPath || ".";
		const makePath = vscode.workspace.asRelativePath(item, false);

		logChannel.info("root Path", rootPath);
		logChannel.info("make Path", makePath);

		const getPathWork = (item: string) => getPathFromWorkspace(makePath, item);

		const conf: MakeConfiguration = {
			name: config,
			includePath: [...includes].sort().map(inc => getPathWork(inc)),
			defines: [...defines],
		};


		if (cStandard === 'c2x') { cStandard = "c23"; }


		conf.cStandard ??= cStandard as CStd;
		conf.cppStandard ??= cppStandard as CStd;

		return conf;

	} catch (error) {
		vscode.window.showErrorMessage(error as string);
		logChannel.error("create config", error);
	}

	return undefined;
}


function getPathFromWorkspace(makePath: string, item: string): string {
	const value = `${makePath}/${item}`;
	logChannel.info("Workspace path", value);
	return value;
}


//----------------------------------------------------------------------------------------------------------------------

function getConfigValue<T>(key: string): T | undefined {
	const value = vscode.workspace.getConfiguration().get<T>(`make-to-cpp-props.${key}`);
	logChannel.info("get config value", [key, value]);
	return value;
}

//----------------------------------------------------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext) {
	logChannel = vscode.window.createOutputChannel('make-to-cpp-props', { log: true });

	activeConfigNameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	activeConfigNameStatusBarItem.command = 'make-to-cpp-props.setActiveConfigName';
	activeConfigNameStatusBarItem.color = new vscode.ThemeColor("statusBarItem.warningForeground");
	activeConfigNameStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
	activeConfigNameStatusBarItem.show();
	context.subscriptions.push(activeConfigNameStatusBarItem);

	await registerCppTools();
	await getConfigs(context);


	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.createConfig', async (item) => createConfig(context, item)));
	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.activeConfigName', () => _activeConfigName));
	context.subscriptions.push(vscode.commands.registerCommand('make-to-cpp-props.setActiveConfigName', () => setActiveConfigName(context)));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async () => {
		await registerCppTools();
		await getConfigs(context);
	}));

	updateActiveConfigName(context, _activeConfigName ?? 'default');
}