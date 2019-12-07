all: nib

WARNINGS=\
		-Wall -Wextra -Wcast-qual -Wcast-align -Wstrict-aliasing -Wpointer-arith \
		-Winit-self -Wshadow -Wredundant-decls -Wfloat-equal -Wundef -Wformat=2 \
		-Wvla -Wstrict-prototypes -Wmissing-prototypes

SQLITE_OPTIONS=\
	-DHAVE_USLEEP=1 -DSQLITE_DQS=0 -DSQLITE_LIKE_DOESNT_MATCH_BLOBS \
	-DSQLITE_MAX_EXPR_DEPTH=0 -DSQLITE_OMIT_DECLTYPE \
	-DSQLITE_OMITPROGRESS_CALLBACK -DSQLITE_OMIT_DEPRECATED \
	-DSQLITE_OMIT_SHARED_CACHE -DSQLITE_THREADSAFE=0

sqlite3.o: sqlite3.c sqlite3.h
	clang -c sqlite3.c -o sqlite3.o -Os $(SQLITE_OPTIONS)

nib: nib.c sqlite3.o
	clang -std=c99 -o nib -Werror $(WARNINGS) nib.c sqlite3.o -ldl

clean:
	rm sqlite3.o nib
