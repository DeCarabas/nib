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

static void buffer_insert(struct Buffer *buffer, int position, const char *data,
                          int length) {
  if (position < 0 || length < 0) {
    die("negative position or length");
  }

  // Ensure we have enough space in the buffer.
  if (buffer->length + length > buffer->capacity) {
    int new_capacity = buffer->capacity * 2;
    buffer->memory = realloc(buffer->memory, sizeof(new_capacity));
    buffer->capacity = new_capacity;
  }

  // Make a hole, if we need to.
  if (position < buffer->length) {
    memmove(buffer->memory + position + length, buffer->memory + position,
            buffer->length - position);
  }

  // Copy into the hole.
  memcpy(buffer->memory + position, data, length);
  buffer->length += length;
}

static void buffer_append(struct Buffer *buffer, const char *data, int length) {
  buffer_insert(buffer, buffer->length, data, length);
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

static int buffer_find(struct Buffer *buffer, char c, int start) {
  if (start < 0) {
    start = 0;
  }
  while (start < buffer->length) {
    if (buffer->memory[start] == c) {
      return start;
    }
    start += 1;
  }
  return -1;
}

static int buffer_rfind(struct Buffer *buffer, char c, int start) {
  if (start >= buffer->length) {
    start = buffer->length - 1;
  }
  while (start >= 0) {
    if (buffer->memory[start] == c) {
      return start;
    }
    start -= 1;
  }
  return -1;
}

#define TERM_INPUT_BUFFER_SIZE (10)

struct Terminal {
  struct termios original_mode;
  struct Buffer buffer;
  int input_fileno;
  int output_fileno;
  int rows;
  int columns;

  int input_buffer_count;
  char input_buffer[TERM_INPUT_BUFFER_SIZE];
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
  terminal->input_buffer_count = 0;

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

static char term_read_raw(struct Terminal *terminal) {
  if (terminal->input_buffer_count) {
    terminal->input_buffer_count -= 1;
    return terminal->input_buffer[terminal->input_buffer_count];
  }

  int nread;
  char c;
  while ((nread = read(terminal->input_fileno, &c, 1)) != 1) {
    if (nread == -1 && errno != EAGAIN) {
      die("read");
    }
  }
  return c;
}

static void term_unread_char(struct Terminal *terminal, char c) {
  if (terminal->input_buffer_count == TERM_INPUT_BUFFER_SIZE) {
    die("overflow on unread buffer");
  }
  terminal->input_buffer[terminal->input_buffer_count] = c;
  terminal->input_buffer_count += 1;
}

#define KEY_CONTROL(c) (c - 'a' + 1)

enum TermKey {
  KEY_NONE = 0,
  KEY_CONTROL_A = KEY_CONTROL('a'),
  KEY_CONTROL_C = KEY_CONTROL('c'),
  KEY_CONTROL_E = KEY_CONTROL('e'),
  KEY_CONTROL_H = KEY_CONTROL('h'),
  KEY_CONTROL_M = KEY_CONTROL('m'),
  KEY_CONTROL_X = KEY_CONTROL('x'),
  KEY_DEL = 127,
  KEY_LEFT = 256,
  KEY_RIGHT = 257,
  KEY_UP = 258,
  KEY_DOWN = 259,
  KEY_HOME = 260,
  KEY_END = 261,
  KEY_PAGE_UP = 262,
  KEY_PAGE_DOWN = 263,
};

static enum TermKey term_read(struct Terminal *terminal) {
  char c1 = term_read_raw(terminal);
  if (c1 == '\x1b') {
    char c2 = term_read_raw(terminal);
    if (c2 == '[') {
      char c3 = term_read_raw(terminal);
      switch (c3) {
      case 'A':
        return KEY_UP;
      case 'B':
        return KEY_DOWN;
      case 'C':
        return KEY_RIGHT;
      case 'D':
        return KEY_LEFT;
      case 'H': // "PC function key"
        return KEY_HOME;
      case 'F': // "PC function key"
        return KEY_END;
      case '1': {
        char c4 = term_read_raw(terminal);
        switch (c4) {
        case '~': // VT 220
          return KEY_HOME;
        }
        term_unread_char(terminal, c4);
        break;
      }
      case '4': {
        char c4 = term_read_raw(terminal);
        switch (c4) {
        case '~': // VT 220
          return KEY_END;
        }
        term_unread_char(terminal, c4);
        break;
      }
      case '5': {
        char c4 = term_read_raw(terminal);
        switch (c4) {
        case '~':
          return KEY_PAGE_UP;
        }
        term_unread_char(terminal, c4);
        break;
      }
      case '6': {
        char c4 = term_read_raw(terminal);
        switch (c4) {
        case '~':
          return KEY_PAGE_DOWN;
        }
        term_unread_char(terminal, c4);
        break;
      }

      default:
        break;
      }

      term_unread_char(terminal, c3);
    }

    term_unread_char(terminal, c2);
  }
  return c1;
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

struct Editor;
struct KeyMap;
typedef void (*KEY_FN)(struct Editor *, int);

struct KeyBinding {
  enum TermKey key;
  KEY_FN fn;
  struct KeyMap *map;
};

struct KeyMap {
  struct KeyBinding *bindings;
  struct KeyMap *parent;
  int capacity;
  int count;
  int refs;
};

static void keymap_init(struct KeyMap **map, struct KeyMap *parent) {
  const int keymap_initial_size = 16;
  struct KeyMap *m = malloc(sizeof(struct KeyMap));
  if (!m) {
    die("Cannot allocate keymap");
  }
  m->bindings = malloc(sizeof(struct KeyBinding) * keymap_initial_size);
  m->parent = parent;
  m->capacity = keymap_initial_size;
  m->count = 0;
  m->refs = 1;

  if (parent) {
    parent->refs += 1;
  }
  *map = m;
}

static struct KeyMap *keymap_ref(struct KeyMap *map) {
  map->refs += 1;
  return map;
}

static void keymap_free(struct KeyMap **map) {
  if (map) {
    struct KeyMap *m = *map;
    while (m) {
      m->refs -= 1;
      if (m->refs) {
        break;
      }

      struct KeyMap *parent = m->parent;
      free(m->bindings);
      m->bindings = NULL;
      free(m);
      m = parent;
    }
    *map = NULL;
  }
}

static void keymap_set(struct KeyMap **dst, struct KeyMap *src) {
  struct KeyMap *tmp = *dst;
  *dst = keymap_ref(src);
  keymap_free(&tmp);
}

static void keymap_bind_key_fn(struct KeyMap *map, int key, KEY_FN fn) {
  if (map->count == map->capacity) {
    map->capacity *= 2;
    map->bindings =
        realloc(map->bindings, sizeof(struct KeyBinding) * map->capacity);
  }
  struct KeyBinding *binding = &(map->bindings[map->count]);
  binding->key = key;
  binding->fn = fn;
  map->count += 1;
}

static void keymap_bind_key_map(struct KeyMap *map, int key,
                                struct KeyMap *sub) {
  if (map->count == map->capacity) {
    map->capacity *= 2;
    map->bindings =
        realloc(map->bindings, sizeof(struct KeyBinding) * map->capacity);
  }
  struct KeyBinding *binding = &(map->bindings[map->count]);
  binding->key = key;
  binding->map = keymap_ref(sub);
  map->count += 1;
}

static struct KeyBinding *keymap_lookup(struct KeyMap *map, enum TermKey key) {
  for (int i = map->count - 1; i >= 0; i--) {
    struct KeyBinding *binding = &map->bindings[i];
    if (binding->key == key) {
      return binding;
    }
  }
  return NULL;
}

struct Editor {
  struct KeyMap *default_keymap;
  struct KeyMap *current_keymap;
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

static char editor_looking_at(struct Editor *e) {
  if (e->position >= e->buffer.length) {
    return 0;
  }

  return e->buffer.memory[e->position];
}

static int editor_line_start(struct Editor *e, int position) {
  int line_start = buffer_rfind(&e->buffer, '\n', position - 1);
  if (line_start < 0) {
    return 0;
  } else {
    return line_start + 1;
  }
}

static void editor_insert_self(struct Editor *e, int c) {
  char ch = (char)c;
  buffer_insert(&e->buffer, e->position, &ch, 1);
  e->column += 1;
  e->position += 1;
}

static void editor_insert_line(struct Editor *e, int c) {
  UNUSED(c);
  char nl = '\n';
  buffer_insert(&e->buffer, e->position, &nl, 1);
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

      int line_start = editor_line_start(e, e->position);
      e->column = e->position - line_start;
    } else {
      e->column -= 1;
    }
  }
}

static void editor_right_char(struct Editor *e, int c) {
  UNUSED(c);
  if (e->position < e->buffer.length) {
    if (editor_looking_at(e) == '\n') {
      e->row += 1;
      e->column = 0;
    } else {
      e->column += 1;
    }
    e->position++;
  }
}

static void editor_left_char(struct Editor *e, int c) {
  UNUSED(c);
  if (e->position > 0) {
    e->position--;
    if (editor_looking_at(e) == '\n') {
      e->row -= 1;

      int line_start = editor_line_start(e, e->position);
      e->column = e->position - line_start;
    } else {
      e->column -= 1;
    }
  }
}

static void editor_next_line(struct Editor *e, int c) {
  UNUSED(c);

  // Scan forward to the end of the line; note that we do *not* increment
  // position here because if we're already at the end of our line we want
  // our position to be unchanged.
  int eol = buffer_find(&e->buffer, '\n', e->position);
  if (eol >= 0) {
    int line_start = eol + 1;
    int line_end = buffer_find(&e->buffer, '\n', line_start);
    if (line_end < 0) {
      line_end = e->buffer.length;
    }

    e->row += 1;
    if (line_start + e->column >= line_end) {
      e->column = line_end - line_start;
      e->position = line_end;
    } else {
      e->position = line_start + e->column;
    }
  } else {
    // Oh, yeah, we're at the end already.
    // Can't move forward, just be at the end of the buffer.
    e->position = e->buffer.length;

    int line_start = editor_line_start(e, e->position);
    e->column = e->position - line_start;
  }
}

static void editor_prev_line(struct Editor *e, int c) {
  UNUSED(c);
  if (e->row > 0) {
    e->row -= 1;

    // Figure out the new position and column based on the previous line
    // position.
    int line_start = editor_line_start(e, e->position);
    int prev_line_start = editor_line_start(e, line_start - 1);
    if (prev_line_start < 0) {
      prev_line_start = 0;
    }

    if (prev_line_start + e->column > line_start) {
      // The cursor would be placed after the end of the line; move us to the
      // end of the line.
      e->column = line_start - prev_line_start - 1;
      e->position = line_start - 1;
    } else {
      // Column remains the same, but the position changes.
      e->position = prev_line_start + e->column;
    }
  }
}

static void editor_move_beginning_of_line(struct Editor *e, int c) {
  UNUSED(c);
  e->position = editor_line_start(e, e->position);
  e->column = 0;
}

static void editor_move_end_of_line(struct Editor *e, int c) {
  UNUSED(c);
  int line_start = editor_line_start(e, e->position);
  int eol = buffer_find(&(e->buffer), '\n', line_start);
  if (eol < 0) {
    e->position = e->buffer.length;
  } else {
    e->position = eol;
  }
  e->column = e->position - line_start;
}

static void editor_beginning_of_buffer(struct Editor *e, int c) {
  UNUSED(c);
  e->column = 0;
  e->row = 0;
  e->position = 0;
}

static void editor_end_of_buffer(struct Editor *e, int c) {
  UNUSED(c);

  // OK... this is the kind of operation that editors usually optimize at some
  // point in their life.
  int cursor = editor_line_start(e, e->position);
  int line_end = buffer_find(&e->buffer, '\n', cursor);
  while (line_end >= 0) {
    e->row += 1;

    cursor = line_end + 1;
    line_end = buffer_find(&e->buffer, '\n', cursor);
  }

  e->position = e->buffer.length;
  e->column = e->position - cursor;
}

static void editor_init_keymap(struct KeyMap *keymap) {
  for (char c = 1; c < 127; c++) {
    if (!iscntrl(c)) {
      keymap_bind_key_fn(keymap, (int)c, editor_insert_self);
    }
  }
  keymap_bind_key_fn(keymap, KEY_CONTROL_A, editor_move_beginning_of_line);
  keymap_bind_key_fn(keymap, KEY_CONTROL_E, editor_move_end_of_line);

  keymap_bind_key_fn(keymap, KEY_CONTROL_M, editor_insert_line);
  keymap_bind_key_fn(keymap, KEY_DEL, editor_backspace);
  keymap_bind_key_fn(keymap, KEY_UP, editor_prev_line);
  keymap_bind_key_fn(keymap, KEY_DOWN, editor_next_line);
  keymap_bind_key_fn(keymap, KEY_LEFT, editor_left_char);
  keymap_bind_key_fn(keymap, KEY_RIGHT, editor_right_char);
  keymap_bind_key_fn(keymap, KEY_HOME, editor_beginning_of_buffer);
  keymap_bind_key_fn(keymap, KEY_END, editor_end_of_buffer);

  {
    struct KeyMap *control_x;
    keymap_init(&control_x, NULL);
    keymap_bind_key_fn(control_x, KEY_CONTROL_C, editor_quit);

    keymap_bind_key_map(keymap, KEY_CONTROL_X, control_x);
    keymap_free(&control_x);
  }
}

static void editor_init(struct Editor *editor) {
  editor->row = 0;
  editor->column = 0;
  editor->position = 0;

  keymap_init(&editor->default_keymap, NULL);
  editor_init_keymap(editor->default_keymap);
  editor->current_keymap = keymap_ref(editor->default_keymap);

  buffer_init(&editor->buffer);
  buffer_init(&editor->status_buffer);
}

static void editor_free(struct Editor *editor) {
  buffer_free(&editor->buffer);
  keymap_free(&editor->default_keymap);
  keymap_free(&editor->current_keymap);
}

static void editor_render(struct Editor *editor, struct Terminal *terminal) {
  term_clear(terminal);

  int row = 0;
  int col = 0;
  char *src = editor->buffer.memory;
  for (int i = 0; i < editor->buffer.length; i++) {
    if (src[i] == '\n') {
      term_write(terminal, "\r\n", 2);
      row += 1;
      col = 0;
      if (row >= terminal->rows - 1) {
        break;
      }
    } else if (col < terminal->columns) {
      term_write(terminal, src + i, 1);
      col += 1;
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
  struct KeyBinding *binding = keymap_lookup(editor->current_keymap, c);
  if (binding) {
    if (binding->map) {
      keymap_set(&editor->current_keymap, binding->map);
    } else {
      binding->fn(editor, c);
      keymap_set(&editor->current_keymap, editor->default_keymap);
    }
  } else {
    // NOT BOUND, JUST GIVE UP.
    keymap_set(&editor->current_keymap, editor->default_keymap);
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
