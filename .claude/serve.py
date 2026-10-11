# Static server for testing on phones over the LAN. Same as `python -m http.server`, but it
# tells browsers not to cache, so a refresh always gets the latest files.
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(http.server.ThreadingHTTPServer):
    # Windows refuses connections past the listen backlog (Python's default is 5) instead of
    # queueing them, so a page fetching many files at once randomly lost a few.
    request_queue_size = 128


root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
handler = functools.partial(NoCacheHandler, directory=root)
print(f'Serving {root} on http://0.0.0.0:{port}', flush=True)
Server(('0.0.0.0', port), handler).serve_forever()
