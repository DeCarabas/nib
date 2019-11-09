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

static void buffer_init(struct Buffer *buffer) {
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

static void buffer_append_int(struct Buffer *buffer, int value) {
  char txt[21]; // -9,223,372,036,854,775,807

  char *end = txt + 21;
  char *cursor = end;

  int neg = 0;
  if (value < 0) {
    neg = 1;
    value = -value;
  }

  while (value) {
    cursor -= 1;
    *cursor = (value % 10) + '0';
    value /= 10;
  }

  if (neg) {
    cursor -= 1;
    *cursor = '-';
  }

  buffer_append(buffer, cursor, end - cursor);
}

static void buffer_clear(struct Buffer *buffer) { buffer->length = 0; }

static void buffer_erase(struct Buffer *buffer, int position) {
  if (position < buffer->length && position >= 0) {
    memmove(buffer->memory + position, buffer->memory + position + 1,
            buffer->length - position);
    buffer->length -= 1;
  }
}

static int buffer_rfind(struct Buffer *buffer, char c, int start) {
  if (start < 0) {
    return -1;
  }
  if (start >= buffer->length) {
    start = buffer->length - 1;
  }
  char *ptr = buffer->memory + start;
  for (;;) {
    if (c == *ptr) {
      return ptr - buffer->memory;
    }
    if (ptr == buffer->memory) {
      return -1;
    }
    ptr -= 1;
  }
}

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
  buffer_init(&terminal->buffer);

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

static int term_read(struct Terminal *terminal) {
  int nread;
  char c;
  while ((nread = read(terminal->input_fileno, &c, 1)) != 1) {
    if (nread == -1 && errno != EAGAIN) {
      die("read");
    }
  }
  return c;
}

static void term_set_cursor(struct Terminal *terminal, int row, int col) {
  buffer_append(&terminal->buffer, "\x1b[", 2);
  buffer_append_int(&terminal->buffer, row + 1);
  buffer_append(&terminal->buffer, ";", 1);
  buffer_append_int(&terminal->buffer, col + 1);
  buffer_append(&terminal->buffer, "H", 1);
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

#define KEY_CONTROL(c) (c - 'a' + 1)
#define KEY_DEL 127

struct Editor;
typedef void (*KEY_FN)(struct Editor *, int);

struct Editor {
  KEY_FN default_keymap[256];
  KEY_FN *current_keymap;
  struct Buffer buffer;
  struct Buffer status_buffer;
  int row;
  int column;
  int position;

  int last_key;
};

static void editor_quit(struct Editor *e, int c) {
  UNUSED(e);
  UNUSED(c);
  exit(0);
}

static void editor_insert_self(struct Editor *e, int c) {
  char ch = (char)c;
  buffer_append(&e->buffer, &ch, 1);
  e->column += 1;
  e->position += 1;
}

static void editor_insert_line(struct Editor *e, int c) {
  UNUSED(c);
  char nl = '\n';
  buffer_append(&e->buffer, &nl, 1);
  e->column = 0;
  e->row += 1;
  e->position += 1;
}

static void editor_backspace(struct Editor *e, int c) {
  UNUSED(c);
  if (e->position > 0) {
    e->position -= 1;
    char erased = e->buffer.memory[e->position];
    buffer_erase(&e->buffer, e->position);
    if (erased == '\n') {
      e->row -= 1;

      int line_start = buffer_rfind(&e->buffer, '\n', e->position);
      if (line_start < 0) {
        line_start = 0;
      }
      e->column = e->position - line_start;
    } else {
      e->column -= 1;
    }
  }
}

static void editor_init_keymap(KEY_FN keymap[256]) {
  memset(keymap, 0, sizeof(KEY_FN) * 256);
  for (char c = 1; c < 127; c++) {
    if (!iscntrl(c)) {
      keymap[(int)c] = editor_insert_self;
    }
  }
  keymap[KEY_CONTROL('q')] = editor_quit;
  keymap[KEY_CONTROL('m')] = editor_insert_line;
  keymap[KEY_CONTROL('h')] = editor_backspace;
  keymap[KEY_DEL] = editor_backspace;
}

static void editor_init(struct Editor *editor) {
  editor->row = 0;
  editor->column = 0;
  editor->position = 0;

  editor_init_keymap(editor->default_keymap);
  editor->current_keymap = editor->default_keymap;
  buffer_init(&editor->buffer);
  buffer_init(&editor->status_buffer);
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
  {
    buffer_clear(&editor->status_buffer);
    const char *message = "Hello world, I am ready for you. ";
    buffer_append(&editor->status_buffer, message, strlen(message));
    buffer_append_int(&editor->status_buffer, editor->last_key);
    term_write(terminal, editor->status_buffer.memory,
               editor->status_buffer.length);
  }

  // Put the cursor where it belongs.
  term_set_cursor(terminal, editor->row, editor->column);
}

static void editor_handle_key(struct Editor *editor, int c) {
  editor->last_key = c; // HACKHACK
  KEY_FN fn = editor->current_keymap[c];
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

    int c = term_read(&terminal);
    editor_handle_key(&editor, c);
  }

  editor_free(&editor);
  term_free(&terminal);
  return 0;
}