# Makefile to C/C++ config

## 0.2.0
* REFACT. Changed icon
* NEW. Added snippets for `c`

## 0.2.0

* Revised extension concept.
* FIX. Intellisens configuration is now updated immediately after changing the selected configuration.
* FIX. Improved stability of configuration generation
* FIX. Now the .vscode folder is not created automatically, it is better to use workspaces
* REFACT. Renamed parameters
* REFACT. Changed the way of getting data from the hook application, now the file is not created
* NEW. The extension log is now output to a separate log, not to the browser console

## 0.1.2

* Added the 'make-to-cpp-props.path' parameter to enable custom paths during config generation

## 0.1.1

* Changed the regular expression for parsing defines

## 0.1.0

* Revised the extension concept.
* Can now act as an intellisens provider for multiroot workspaces.
* Generated configuration is saved in the settings file, not in c_cpp_properties.json

## 0.0.4

* added `make-to-cpp-props.toolchainVersion` parameter to configure the toolchain version
* now the decoy can respond with a version number to the `--version` parameter, which is relevant for build systems where a clearly defined toolchain is needed

## 0.0.3

* added `make-to-cpp-props.generator.make` parameter to configure the build command.

## 0.0.2

* Partially fixed the problem with generating paths to includes
* Added description and instructions
* Added license
* Added settings for searching for defines and includes

## 0.0.1

* Initial release
