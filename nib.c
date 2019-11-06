#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>

static void die(const char *message) {
  perror(message);
  exit(1);
}

#define UNUSED(x) (void)(x)

struct Buffer {
  char *memory;
  int length;
  int capacity;
};

static void bufffer_init(struct Buffer *buffer) {
  const int initial_buffer_size = 4 * 1024;
  buffer->memory = malloc(initial_buffer_size);
  buffer->length = 0;
  buffer->capacity = initial_buffer_size;
}

static void buffer_free(struct Buffer *buffer) {
  free(buffer->memory);
  buffer->memory = NULL;
  buffer->capacity = 0;
  buffer->length = 0;
}

static void buffer_append(struct Buffer *buffer, const char *data, int length) {
  if (buffer->capacity - buffer->length < length) {
    int new_capacity = buffer->capacity * 2;
    buffer->memory = realloc(buffer->memory, sizeof(new_capacity));
    buffer->capacity = new_capacity;
  }

  memcpy(buffer->memory + buffer->length, data, length);
  buffer->length += length;
}

static void buffer_clear(struct Buffer *buffer) { buffer->length = 0; }

struct Terminal {
  struct termios original_mode;
  struct Buffer buffer;
  int input_fileno;
  int output_fileno;
  int rows;
  int columns;
};

static struct Terminal *global_terminal = NULL;

static void term_atexit(void);

static int term_get_size(int fileno, int *rows, int *cols) {
  struct winsize ws;
  if (ioctl(fileno, TIOCGWINSZ, &ws) == -1 || ws.ws_col == 0) {
    // TODO: Complex escape codes to get the actual size. :P
    return -1;
  } else {
    *cols = ws.ws_col;
    *rows = ws.ws_row;
    return 0;
  }
}

static void term_init(struct Terminal *terminal, int input_fileno,
                      int output_fileno) {
  global_terminal = terminal;
  terminal->input_fileno = input_fileno;
  terminal->output_fileno = output_fileno;
  bufffer_init(&terminal->buffer);

  // Setup raw mode for the terminal.
  if (tcgetattr(input_fileno, &terminal->original_mode) == -1) {
    die("tcgetattr setting raw");
  }
  struct termios raw = terminal->original_mode;
  raw.c_iflag &= ~(BRKINT | ICRNL | INPCK | ISTRIP | IXON);
  raw.c_oflag &= ~(OPOST);
  raw.c_cflag |= (CS8);
  raw.c_lflag &= ~(ECHO | ICANON | IEXTEN | ISIG);

  raw.c_cc[VMIN] = 0;  // Minimum characters before returning.
  raw.c_cc[VTIME] = 1; // Timeout in 100ms increments.

  if (tcsetattr(input_fileno, TCSAFLUSH, &raw) == -1) {
    die("tcsetattr setting raw");
  }

  if (term_get_size(input_fileno, &terminal->rows, &terminal->columns)) {
    die("term_get_size");
  }

  atexit(term_atexit);
}

static void term_free(struct Terminal *terminal) {
  struct termios *original = &(terminal->original_mode);
  if (tcsetattr(terminal->input_fileno, TCSAFLUSH, original) == -1) {
    die("tcsetattr");
  }
  buffer_free(&terminal->buffer);
  global_terminal = NULL;
}

static void term_atexit(void) {
  if (global_terminal) {
    term_free(global_terminal);
  }
}

static char term_read(struct Terminal *terminal) {
  int nread;
  char c;
  while ((nread = read(terminal->input_fileno, &c, 1)) != 1) {
    if (nread == -1 && errno != EAGAIN) {
      die("read");
    }
  }
  return c;
}

static void term_set_cursor(struct Terminal *terminal) {
  buffer_append(&terminal->buffer, "\x1b[H", 3); // Cursor to upper-left
}

static void term_clear(struct Terminal *terminal) {
  struct Buffer *buffer = &terminal->buffer;
  buffer_clear(buffer);
  buffer_append(buffer, "\x1b[?25l", 6); // Hide cursor
  buffer_append(buffer, "\x1b[2J", 4);   // Clear screen
  buffer_append(buffer, "\x1b[H", 3);    // Cursor to upper-left
}

static void term_draw(struct Terminal *terminal) {
  struct Buffer *buffer = &terminal->buffer;
  buffer_append(buffer, "\x1b[?25h", 6); // Show cursor
  write(terminal->output_fileno, buffer->memory, buffer->length);
}

static void term_write(struct Terminal *terminal, const char *data,
                       int length) {
  buffer_append(&terminal->buffer, data, length);
}

#define CONTROL(c) (c - 'a' + 1)

struct Editor;
typedef void (*KEY_FN)(struct Editor *, char);

struct Editor {
  KEY_FN keymap[256];
  struct Buffer buffer;
};

static void editor_quit(struct Editor *e, char c) {
  UNUSED(e);
  UNUSED(c);
  exit(0);
}

static void editor_insert_self(struct Editor *e, char c) {
  buffer_append(&e->buffer, &c, 1);
}

static void editor_insert_line(struct Editor *e, char c) {
  c = '\n';
  buffer_append(&e->buffer, &c, 1);
}

static void editor_init_keymap(KEY_FN keymap[256]) {
  memset(keymap, 0, sizeof(KEY_FN) * 256);
  for (char c = 1; c < 127; c++) {
    if (!iscntrl(c)) {
      keymap[(int)c] = editor_insert_self;
    }
  }
  keymap[CONTROL('q')] = editor_quit;
  keymap[CONTROL('m')] = editor_insert_line;
}

static void editor_init(struct Editor *editor) {
  editor_init_keymap(editor->keymap);
  bufffer_init(&editor->buffer);
}

static void editor_free(struct Editor *editor) { buffer_free(&editor->buffer); }

static void editor_render(struct Editor *editor, struct Terminal *terminal) {
  term_clear(terminal);

  int row = 0;
  char *src = editor->buffer.memory;
  for (int i = 0; i < editor->buffer.length; i++) {
    if (src[i] == '\n') {
      term_write(terminal, "\r\n", 2);
      row += 1;
      if (row >= terminal->rows - 1) {
        break;
      }
    } else {
      term_write(terminal, src + i, 1);
    }
  }
  term_write(terminal, "\r\n", 2);
  row += 1;
  for (; row < terminal->rows - 1; row++) {
    term_write(terminal, "~\r\n", 3);
  }

  // Status line.
  const char *message = "Hello world, I am ready for you.";
  term_write(terminal, message, strlen(message));
  term_set_cursor(terminal);
}

static void editor_handle_key(struct Editor *editor, char c) {
  KEY_FN fn = editor->keymap[(int)c];
  if (fn) {
    fn(editor, c);
  }
}

int main() {
  struct Terminal terminal;
  term_init(&terminal, STDIN_FILENO, STDOUT_FILENO);

  struct Editor editor;
  editor_init(&editor);

  for (;;) {
    editor_render(&editor, &terminal);
    term_draw(&terminal);

    char c = term_read(&terminal);
    editor_handle_key(&editor, c);
  }

  editor_free(&editor);
  term_free(&terminal);
  return 0;
}