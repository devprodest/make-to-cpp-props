# Makefile to C/C++ config

Генератор конфигураций для C/C++ for Visual Studio Code.

## Принцип работы

Что бы было понятно как работать и как устранять проблемы.

1. Из параметра `make-to-cpp-props.toolchainName` берется имя тулчейна, например `arm-none-eabi-gcc`
2. На основе имени тулчейна создается "ловушка"
3. При генерировании конфига вызывается команд `make`, а путь к пустышке добавляется в начало перечислений переменной среды `PATH`. Тем самым "ловушка" подменяет собой реальный тулчейна и собирает параметры командной строки с которыми вызван тулчейн.
4. Собранные данные анализируются регулярными выражениями и заполняется структура файла конфига.
5. Если конфиг с таким именем уже существует, то он обновляется, если нет - создается.

Исходный код "Ловушки"

```c
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char *argv[])
{
    FILE *fv = fopen("version.cfg", "r");
    if (fv)
    {
        fgets(version, sizeof(version), fv);
        fclose(fv);
    }
    FILE *fp = fopen("output.txt", "a+");
    for (int i = 0; i < argc; i++)
    {
        if (strncmp(argv[ i ], "--version", 10) == 0) { printf("%s (%s) %s\n", argv[ 0 ], version, version); }

        fprintf(fp, "%s ", argv[ i ]);
    }
    fprintf(fp, "\n");
    fclose(fp);
    return 0;
}
```

## Настройка в качестве провайдера intellisens

Это необходимо для нормальной работы в мультирут воркспейсах

```json
"C_Cpp.default.configurationProvider": "ZaikinDenis.make-to-cpp-props",
```

![Alt text](assets/config-selector.png)

## Как использовать

1. Установить и настроить
1. Вызвать контекстное меню на папке в которой лежит целевой Makefile. Поддерживаются стандартные имена "GNUmakefile", "makefile", "Makefile" и файлы ".mk"
1. Запустить команду и дождаться выполнения.


```json
"make-to-cpp-props.toolchainVersion": "10.0.1",
"make-to-cpp-props.toolchainPrefix": "arm-none-eabi",
"make-to-cpp-props.generator.make": "make clean && make all",
"make-to-cpp-props.generator.CompilerPath": "/path/to/gcc/bin",
"make-to-cpp-props.path": {
    "linux": [
        "/path/to/1",
        "/path/to/2"
    ],
    "windows": [
        "c:/path/to/1",
        "c:/path/to/2"
    ],
},
```

![Demo](assets/how-to-use.gif)



## Существующие проблемы

1. Регулярки (не специалист в них, буду рад помощи)

## Планы

1. Исправление проблемы
1. Сделать генератор тасков с указанием нужных путей