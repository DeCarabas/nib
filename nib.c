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

static void editor_render(struct Terminal *terminal) {
  term_clear(terminal);
  for (int i = 0; i < terminal->rows - 1; i++) {
    term_write(terminal, "~\r\n", 3);
  }
  const char *message = "Hello world, I am ready for you.";
  term_write(terminal, message, strlen(message));
  term_set_cursor(terminal);
}

int main() {
  struct Terminal terminal;
  term_init(&terminal, STDIN_FILENO, STDOUT_FILENO);

  for (;;) {
    editor_render(&terminal);
    term_draw(&terminal);
    char c = term_read(&terminal);
    if (c == 'q') {
      break;
    }
  }

  term_free(&terminal);
  return 0;
}