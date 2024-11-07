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