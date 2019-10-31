#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

#define CTRL_KEY(k) ((k)&0x1f)

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

static void buffer_append_z(struct Buffer *buffer, const char *data) {
  buffer_append(buffer, data, strlen(data));
}

struct termios original_mode;

static void screen_restore_mode(void) {
  if (tcsetattr(STDIN_FILENO, TCSAFLUSH, &original_mode) == -1) {
    die("tcsetattr");
  }
}

static void screen_raw_mode(void) {
  if (tcgetattr(STDIN_FILENO, &original_mode) == -1) {
    die("tcgetattr setting raw");
  }
  struct termios raw = original_mode;
  raw.c_iflag &= ~(BRKINT | ICRNL | INPCK | ISTRIP | IXON);
  raw.c_oflag &= ~(OPOST);
  raw.c_cflag |= (CS8);
  raw.c_lflag &= ~(ECHO | ICANON | IEXTEN | ISIG);

  raw.c_cc[VMIN] = 0;  // Minimum characters before returning.
  raw.c_cc[VTIME] = 1; // Timeout in 100ms increments.

  if (tcsetattr(STDIN_FILENO, TCSAFLUSH, &raw) == -1) {
    die("tcsetattr setting raw");
  }
  atexit(screen_restore_mode);
}

static void screen_clear(void) { write(STDOUT_FILENO, "\x1b[2J\x1b[H", 7); }

static void screen_draw(struct Buffer *buffer) {
  screen_clear();
  write(STDOUT_FILENO, buffer->memory, buffer->length);
}

static char key_read(void) {
  int nread;
  char c;
  while ((nread = read(STDIN_FILENO, &c, 1)) != 1) {
    if (nread == -1 && errno != EAGAIN) {
      die("read");
    }
  }
  return c;
}

int main() {
  struct Buffer buffer;
  bufffer_init(&buffer);
  buffer_append_z(&buffer, "Hello World!");

  screen_raw_mode();
  for (;;) {
    screen_draw(&buffer);
    char c = key_read();
    if (c == 'q') {
      break;
    }
  }

  buffer_free(&buffer);
  return 0;
}