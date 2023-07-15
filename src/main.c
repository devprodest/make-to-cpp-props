#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[])
{
    FILE * fp = fopen("output.txt", "a+");

    for (int i = 0; i < argc; i++) { fprintf(fp, "%s ", argv[i]); }

    fprintf(fp, "\n");

    fclose(fp);
    
    return 0;
}