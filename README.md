[![](https://vsmarketplacebadges.dev/version-short/ZaikinDenis.make-to-cpp-props.svg)](https://marketplace.visualstudio.com/items?itemName=ZaikinDenis.make-to-cpp-props)
[![](https://vsmarketplacebadges.dev/downloads-short/ZaikinDenis.make-to-cpp-props.svg)](https://marketplace.visualstudio.com/items?itemName=ZaikinDenis.make-to-cpp-props)
[![](https://vsmarketplacebadges.dev/rating-short/ZaikinDenis.make-to-cpp-props.svg)](https://marketplace.visualstudio.com/items?itemName=ZaikinDenis.make-to-cpp-props)
![](https://img.shields.io/github/actions/workflow/status/devprodest/make-to-cpp-props/webpack.yml)


# Makefile to C/C++ config

Configuration Generator for C/C++ for Visual Studio Code.

## How it works

So that it would be clear how to work and how to fix problems.

1. The toolchain name is taken from the `make-to-cpp-props.generator.toolchainPath` parameter, for example `arm-none-eabi-gcc`
2. A “trap” is created based on the toolchain name
3. When generating a config, the `make` command is called, and the path to the dummy is added to the beginning of the `PATH` environment variable listings. Thus, the "trap" replaces the real toolchain and collects the command line parameters with which the toolchain is called.
4. The collected data is analyzed by regular expressions and the config file structure is filled.
5. If a config with this name already exists, it is updated, if not, it is created.

Source code of "Trap"

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static char version[ 64 ] = "10.1.0";
int main(int argc, char *argv[])
{
    FILE *fv = fopen("version.cfg", "r");
    if (fv)
    {
        fgets(version, sizeof(version), fv);
        fclose(fv);
    }
    char * string = malloc(2*1024*1024);
    char * str = string;
    for (int i = 0; i < argc; i++)
    {
        if (strncmp(argv[ i ], "--version", 10) == 0) { printf("%s (%s) %s\n", argv[ 0 ], version, version); }
        size_t len = sprintf(str, "%s ", argv[ i ]);
        str += len;
    }
    printf("%s\n", string);
    free(string);
    return 0;
}
```


## Configuration

### Generator settings

```json
"make-to-cpp-props.generator.toolchainVersion": "10.0.1",
"make-to-cpp-props.generator.toolchainPath": "arm-none-eabi-gcc",
"make-to-cpp-props.generator.make": "make clean && make all -j",
"make-to-cpp-props.generator.CompilerPath": "/path/to/gcc/bin/arm-none-eabi-gcc",
"make-to-cpp-props.generator.env.path": {
    "linux": [
        "/path/to/1",
        "/path/to/2"
    ],
    "windows": [
        "c:/path/to/1",
        "c:/path/to/2"
    ]
},
```

### Configuring as an intellisens provider

This is necessary for normal operation in multi-root workspaces.

```json
"C_Cpp.default.configurationProvider": "ZaikinDenis.make-to-cpp-props",
```

![config selector](assets/config-selector.png)

## Usage

1. Install and configure
2. Call the context menu on the folder where the target Makefile is located. The standard names "GNUmakefile", "makefile", "Makefile" and ".mk" files are supported
3. Run the generation command and wait for execution.

Two parameters will appear in the settings file:
* Current configuration name
* Configuration description

```json
"make-to-cpp-props.configurations": [
    {
        "name": "config2",
        "includePath": [
            "workspace/config2/../../../../lib/drivers",
            "workspace/config2/../../../../lib/middleware",\
        ],
        "defines": [
            "NDEBUG",
            "FIRMWARE_VERSION_MAJOR=0x0333333",\
        ],
        "cStandard": "c23"
    },
    {
        "name": "config1",
        "includePath": [
            "workspace/config1/../../../../lib/drivers",
            "workspace/config1/../../../../lib/middleware",
            "workspace/config1/../../../../lib/sys",\
        ],
        "defines": [
            "FIRMWARE_VERSION_MAJOR=0x0333333",
        ],
        "cStandard": "c23"
    }
],
"make-to-cpp-props.activeConfigName": "config2",
```

## Existing problems

1. Regular expressions (not an expert in them, I will be glad to help)

## Plans

1. Move information about build configurations to separate files.
2. Move the current configuration from the settings to a separate local storage.
