import subprocess, sys

# 用 psutil 如果有，否则 subprocess 调用 wmic
try:
    import psutil
    have_psutil = True
except ImportError:
    have_psutil = False

if not have_psutil:
    print("psutil not available, trying wmic...")
    r = subprocess.run(['wmic', 'process', 'where', "Name='python.exe'", 'get', 'ProcessId,CommandLine', '/format:list'],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(r.stdout)
    sys.exit(0)

print("All python.exe processes:")
for p in psutil.process_iter(['pid', 'name', 'cmdline', 'exe']):
    if p.info['name'] and 'python' in p.info['name'].lower():
        print(f"PID {p.info['pid']}")
        print(f"  exe: {p.info.get('exe')}")
        print(f"  cmdline: {p.info.get('cmdline')}")
        print()