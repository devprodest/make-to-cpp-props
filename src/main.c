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