import socket, sys

def raw_get(path, timeout=20):
    s = socket.create_connection(('127.0.0.1', 8766), timeout=timeout)
    req = f'GET {path} HTTP/1.0\r\nHost: localhost\r\nAccept: application/json\r\n\r\n'
    s.sendall(req.encode())
    s.settimeout(timeout)
    buf = b''
    while True:
        try:
            chunk = s.recv(4096)
        except socket.timeout:
            break
        if not chunk:
            break
        buf += chunk
        if len(buf) > 16000:
            break
    s.close()
    return buf

for p in ['/api/ui-config', '/api/product-templates', '/']:
    print('=' * 60)
    print(f'GET {p}')
    try:
        r = raw_get(p, 15)
        if not r:
            print('  EMPTY response (server hung)')
            continue
        head, _, body = r.partition(b'\r\n\r\n')
        status = head.split(b'\r\n', 1)[0].decode('utf-8', 'replace')
        print(f'  STATUS: {status}')
        ctype = ''
        for line in head.split(b'\r\n'):
            if line.lower().startswith(b'content-type:'):
                ctype = line.decode()
                break
        print(f'  {ctype}')
        print(f'  BODY[:400]:')
        print('  ' + body[:400].decode('utf-8', 'replace').replace('\n', '\n  '))
    except Exception as e:
        print(f'  ERR: {type(e).__name__}: {e}')