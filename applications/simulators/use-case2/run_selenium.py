import argparse, time, json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

# energy model placeholders (поменяйте на реальные значения позже)
TRANSFER_MJ_PER_BYTE = (0.05 / 1024.0)   # mJ per byte (пример: 0.05 mJ/KiB)
CLIENT_CPU_WATTS = 4.0                   # средняя мощность CPU клиента в ваттах

def metrics_to_map(metrics):
    return {m['name']: float(m['value']) for m in metrics}

def create_driver(remote_url):
    opts = Options()
    # не навязываем headless/fragments — контейнер selenium уже запускает Chrome
    caps = DesiredCapabilities.CHROME.copy()
    driver = webdriver.Remote(command_executor=remote_url, desired_capabilities=caps, options=opts)
    driver.set_page_load_timeout(120)
    return driver

fetch_script = """
const [url, cb] = arguments;
(async () => {
  try {
    try { performance.clearResourceTimings(); } catch(e){}
    const t0 = performance.now();
    const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
    const buf = await r.arrayBuffer();
    const t1 = performance.now();
    const entries = performance.getEntriesByName(url);
    const entry = entries && entries.length ? entries[0] : null;
    const decoded = entry ? (entry.decodedBodySize || buf.byteLength) : buf.byteLength;
    const encoded = entry ? (entry.encodedBodySize || buf.byteLength) : buf.byteLength;
    const transfer = entry ? (entry.transferSize || buf.byteLength) : buf.byteLength;
    cb({
      status: r.status,
      duration_ms: (t1 - t0),
      decoded_bytes: decoded,
      encoded_bytes: encoded,
      transfer_bytes: transfer,
      resourceTiming: entry ? {
        name: entry.name, initiatorType: entry.initiatorType, transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize, duration: entry.duration
      } : null
    });
  } catch (err) {
    cb({ error: String(err) });
  }
})();
"""

def run_fetch_and_measure(driver, url):
    try:
        driver.execute_cdp_cmd('Performance.enable', {})
    except Exception:
        pass
    before = {}
    try:
        resp = driver.execute_cdp_cmd('Performance.getMetrics', {})
        before = metrics_to_map(resp.get('metrics', resp.get('result', resp)))
    except Exception:
        before = {}
    res = driver.execute_async_script(fetch_script, url)
    if isinstance(res, dict) and res.get('error'):
        raise RuntimeError("Browser fetch error: " + res['error'])
    after = {}
    try:
        resp2 = driver.execute_cdp_cmd('Performance.getMetrics', {})
        after = metrics_to_map(resp2.get('metrics', resp2.get('result', resp2)))
    except Exception:
        after = {}
    client_cpu_s = 0.0
    if 'TaskDuration' in after and 'TaskDuration' in before:
        client_cpu_s = max(0.0, after['TaskDuration'] - before['TaskDuration'])
    else:
        client_cpu_s = max(0.0, after.get('ScriptDuration', 0.0) - before.get('ScriptDuration', 0.0))
    res['client_cpu_s'] = float(client_cpu_s)
    return res, before, after

def compute_energy(res):
    transfer_mj = res['transfer_bytes'] * TRANSFER_MJ_PER_BYTE
    client_decompress_mj = res['client_cpu_s'] * CLIENT_CPU_WATTS * 1000.0
    return {
        'transfer_energy_mJ': transfer_mj,
        'client_decompress_energy_mJ': client_decompress_mj,
        'total_client_side_energy_mJ': transfer_mj + client_decompress_mj
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--file', required=True)
    p.add_argument('--url-base', default='http://elvira.lib/books')
    p.add_argument('--strategy', type=int, choices=[1,2,3], default=3)
    p.add_argument('--selenium-remote', default='http://localhost:4444/wd/hub')
    p.add_argument('--report', default=None)
    args = p.parse_args()

    target = args.url_base.rstrip('/') + '/' + args.file.lstrip('/')

    driver = create_driver(args.selenium_remote)
    try:
        fetched, perf_before, perf_after = run_fetch_and_measure(driver, target)
        energy = compute_energy(fetched)
        payload = {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S.%fZ', time.gmtime()),
            'strategy': args.strategy,
            'file': args.file,
            'url': target,
            'metrics': {
                'client_duration_ms': fetched.get('duration_ms', 0.0),
                'decoded_bytes': int(fetched.get('decoded_bytes', 0)),
                'encoded_bytes': int(fetched.get('encoded_bytes', 0)),
                'transfer_bytes': int(fetched.get('transfer_bytes', 0)),
                'client_cpu_s': float(fetched.get('client_cpu_s', 0.0)),
                **energy
            },
            'perf_before': perf_before,
            'perf_after': perf_after,
            'resourceTiming': fetched.get('resourceTiming')
        }
        print(json.dumps(payload, indent=2))
        if args.report:
            try:
                import requests
                requests.post(args.report, json=payload, timeout=15)
            except Exception as e:
                # если requests не установлена в контейнере, просто печатаем ошибку
                print("Report POST failed:", e)
    finally:
        try:
            driver.quit()
        except:
            pass

if __name__ == '__main__':
    main()
