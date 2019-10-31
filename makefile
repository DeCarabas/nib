all: nib

WARNINGS=\
        -Wall -Wextra -Wcast-qual -Wcast-align -Wstrict-aliasing -Wpointer-arith \
        -Winit-self -Wshadow -Wredundant-decls -Wfloat-equal -Wundef -Wformat=2 \
        -Wvla -Wstrict-prototypes -Wmissing-prototypes

nib: nib.c
	clang -std=c99 -o nib -Werror $(WARNINGS) nib.c