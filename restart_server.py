import psutil, os, subprocess, time

# 杀光所有 server.py 进程
killed = []
for p in psutil.process_iter(['pid', 'cmdline']):
    try:
        cl = p.info.get('cmdline') or []
        if any('admin/server.py' in s for s in cl):
            killed.append(p.info['pid'])
            p.kill()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

print(f"Killed {len(killed)} server.py processes: {killed}")
time.sleep(2)

# 确认都死了
remaining = [p.info['pid'] for p in psutil.process_iter(['pid', 'cmdline']) if any('admin/server.py' in s for s in (p.info.get('cmdline') or []))]
print(f"Remaining: {remaining}")

# 用绝对路径启动新 server，并把日志重定向
log = open('server_stdout.log', 'wb')
err = open('server_stderr.log', 'wb')
proc = subprocess.Popen(
    ['C:\\Users\\Admin\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe', 'admin/server.py', '8766'],
    cwd='C:\\Users\\Admin\\WorkBuddy\\elecsim-admin-pack',
    stdout=log, stderr=err,
)
print(f"Started new server PID {proc.pid}, cwd: elecsim-admin-pack")
print("Waiting 3s for boot...")
time.sleep(3)
print(f"Process alive: {proc.poll() is None}")