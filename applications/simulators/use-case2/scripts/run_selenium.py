#!/usr/bin/env python3
import argparse
import sys
import json
import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

def create_driver(remote_url: str):
    opts = Options()

    # Base arguments
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--disable-extensions')
    opts.add_argument('--disable-setuid-sandbox')
    opts.add_argument('--disable-infobars')
    opts.add_argument('--remote-debugging-port=9222')

    # Network fixes
    opts.add_argument('--disable-features=NetworkService,NetworkServiceInProcess')
    opts.add_argument('--disable-background-networking')
    opts.add_argument('--disable-background-timer-throttling')
    opts.add_argument('--disable-renderer-backgrounding')
    opts.add_argument('--disable-backgrounding-occluded-windows')

    # DNS/proxy
    opts.add_argument('--no-proxy-server')
    opts.add_argument('--disable-async-dns')
    opts.add_argument('--disable-features=AsyncDNS,DnsOverHttps')

    # Window and user-agent
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument("--disable-features=AcceptCHFrame")
    opts.add_argument('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')

    # Headless via env var
    if os.environ.get('HEADLESS', '1') not in ('0', 'false', 'False'):
        opts.add_argument('--headless=new')

    # Capabilities
    opts.set_capability('goog:loggingPrefs', {'performance': 'ALL'})

    try:
        print(f"connecting to selenium at {remote_url}", file=sys.stderr)
        driver = webdriver.Remote(command_executor=remote_url, options=opts)
        driver.set_page_load_timeout(300)
        print("session successfully created!", file=sys.stderr)
        return driver
    except Exception as e:
        print("error: failed to create driver", file=sys.stderr)
        print(str(e), file=sys.stderr)
        sys.exit(1)


def parse_performance_logs_for_pdf(driver, filename):
    """Parse CDP performance logs to find the PDF request details."""
    try:
        logs = driver.get_log('performance')
    except Exception as e:
        print("cannot get performance logs:", e, file=sys.stderr)
        return {}

    requests = {}
    for entry in logs:
        try:
            message = json.loads(entry['message'])['message']
        except Exception:
            continue
        method = message.get('method')
        params = message.get('params', {})

        if method == 'Network.requestWillBeSent':
            reqId = params.get('requestId')
            url = params.get('request', {}).get('url') or params.get('documentURL')
            ts = params.get('timestamp')
            if reqId:
                r = requests.setdefault(reqId, {})
                r['start_ts'] = ts
                r['url'] = url

        if method == 'Network.responseReceived':
            reqId = params.get('requestId')
            resp = params.get('response', {})
            url = resp.get('url')
            headers = resp.get('headers', {})
            ts = params.get('timestamp')
            if reqId:
                r = requests.setdefault(reqId, {})
                r['url'] = r.get('url') or url
                r['response_ts'] = ts
                norm_headers = {k.lower(): v for k, v in headers.items()}
                r['response_headers'] = norm_headers

        if method == 'Network.loadingFinished':
            reqId = params.get('requestId')
            enc_len = params.get('encodedDataLength')
            ts = params.get('timestamp')
            if reqId:
                r = requests.setdefault(reqId, {})
                r['encoded_len'] = enc_len
                r['load_ts'] = ts

    candidates = [r for r in requests.values() if r.get('url') and filename in r.get('url', '')]
    if not candidates:
        print("no candidate requests found for file", filename, file=sys.stderr)
        return {}

    # Pick the best candidate (most complete data)
    def score(r):
        s = 0
        if r.get('encoded_len') is not None: s += 10
        if r.get('load_ts') is not None: s += 5
        if r.get('response_ts') is not None: s += 2
        return s

    best = max(candidates, key=score)
    headers = best.get('response_headers') or {}
    ce = headers.get('content-encoding')

    return {
        'url': best.get('url'),
        'encoded_len': best.get('encoded_len'),
        'start_ts': best.get('start_ts'),
        'response_ts': best.get('response_ts'),
        'load_ts': best.get('load_ts'),
        'content_encoding': ce
    }


def measure_fetch_decode(driver, url):
    """Measure full fetch + decode time via JS fetch + arrayBuffer()."""
    fetch_script = """
    const url = arguments[0];
    const callback = arguments[arguments.length - 1];
    const t0 = performance.now();
    fetch(url, {cache: 'reload'}).then(resp => resp.arrayBuffer()).then(buf => {
        const duration = Math.round(performance.now() - t0);
        callback({decoded_bytes: buf.byteLength, duration_ms: duration});
    }).catch(e => {
        callback({error: String(e)});
    });
    """
    try:
        return driver.execute_async_script(fetch_script, url)
    except Exception as e:
        return {'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description="Selenium: collect PDF metrics + screenshot")
    parser.add_argument('--file', required=True)
    parser.add_argument('--url-base', default='http://elvira.lib/books')
    parser.add_argument('--selenium-remote', default='http://localhost:4444')
    parser.add_argument('--strategy', type=int, choices=[1,2,3], default=3)
    args = parser.parse_args()

    target_url = args.url_base.rstrip('/') + '/' + args.file.lstrip('/')
    print(f"Target URL: {target_url}", file=sys.stderr)

    driver = None
    success = False
    metrics = {}

    try:
        driver = create_driver(args.selenium_remote)

        print(f"Navigating to {target_url}...", file=sys.stderr)
        driver.get(target_url)

        WebDriverWait(driver, 30).until(lambda d: d.execute_script('return document.readyState') == 'complete')
        print("document readyState: complete", file=sys.stderr)

        # Give PDF viewer time to render the first page
        time.sleep(3)

        # === TAKE SCREENSHOT EARLY (while PDF is rendered) ===
        screenshot_path = "/tmp/book_screenshot.png"
        try:
            driver.save_screenshot(screenshot_path)
            print(f"Screenshot saved to {screenshot_path}", file=sys.stderr)
        except Exception as e:
            print("screenshot failed:", e, file=sys.stderr)

        # === Now do heavy measurements (may temporarily affect renderer) ===
        fetch_res = measure_fetch_decode(driver, target_url)
        print("fetch result:", fetch_res, file=sys.stderr)

        time.sleep(0.5)  # let final network events arrive

        cdp_info = parse_performance_logs_for_pdf(driver, args.file)
        print("parsed cdp result:", cdp_info, file=sys.stderr)

        # Fallback: performance resource entries
        try:
            perf_entries = driver.execute_script("""
                return performance.getEntriesByType('resource').map(e => ({
                    name: e.name,
                    encodedBodySize: e.encodedBodySize || 0,
                    transferSize: e.transferSize || 0,
                    startTime: e.startTime,
                    responseEnd: e.responseEnd
                }));
            """)
        except Exception:
            perf_entries = []

        # Build detailed metrics
        if 'error' in fetch_res:
            metrics['error'] = fetch_res['error']
        else:
            decoded = int(fetch_res.get('decoded_bytes', 0))
            duration_ms = int(fetch_res.get('duration_ms', 0))

            # encoded size
            encoded_used = 0
            if cdp_info and cdp_info.get('encoded_len'):
                encoded_used = int(cdp_info['encoded_len'])
            if not encoded_used and perf_entries:
                for e in perf_entries:
                    if args.file in e.get('name', ''):
                        encoded_used = int(e.get('encodedBodySize') or e.get('transferSize') or 0)
                        break

            # network transfer time
            network_transfer_ms = None
            if cdp_info and cdp_info.get('start_ts') is not None and cdp_info.get('load_ts') is not None:
                network_transfer_ms = int((cdp_info['load_ts'] - cdp_info['start_ts']) * 1000)
            if network_transfer_ms is None and perf_entries:
                for e in perf_entries:
                    if args.file in e.get('name', '') and e.get('startTime') is not None and e.get('responseEnd') is not None:
                        network_transfer_ms = int(e['responseEnd'] - e['startTime'])
                        break

            client_decompress_ms = None
            if network_transfer_ms is not None:
                client_decompress_ms = max(0, duration_ms - network_transfer_ms)

            was_compressed = bool(cdp_info.get('content_encoding')) or (encoded_used and decoded > encoded_used)

            compression_ratio = round(decoded / encoded_used, 3) if encoded_used else 1.0

            metrics = {
                "transfer_size_bytes": int(encoded_used or 0),
                "encoded_body_size_bytes": int(encoded_used or 0),
                "decoded_body_size_bytes": int(decoded),
                "was_compressed": bool(was_compressed),
                "compression_ratio": compression_ratio,
                "pdf_processing_duration_ms": int(duration_ms),
                "client_decompress_ms": int(client_decompress_ms) if client_decompress_ms is not None else None,
                "network_transfer_ms": int(network_transfer_ms) if network_transfer_ms is not None else None,
                "resource_name": cdp_info.get('url') if cdp_info else target_url
            }

        success = True

    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        metrics["error"] = str(e)
        success = False
    finally:
        if driver:
            print("closing driver...", file=sys.stderr)
            try:
                driver.quit()
            except Exception:
                pass
            print("driver closed.", file=sys.stderr)

    result = {
        "success": success,
        "url": target_url,
        "strategy": args.strategy,
        "metrics": metrics,
        "screenshot": "/tmp/book_screenshot.png" if success else None
    }

    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()