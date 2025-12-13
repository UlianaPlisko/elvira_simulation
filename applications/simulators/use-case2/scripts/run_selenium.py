#!/usr/bin/env python3
import argparse
import sys
import os
import json
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

def create_driver(remote_url: str):
    opts = Options()

    # Basic safe arguments for Docker/Selenium
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--disable-extensions')
    opts.add_argument('--disable-setuid-sandbox')
    opts.add_argument('--disable-infobars')
    opts.add_argument('--remote-debugging-port=9222')

    # Key network fixes
    opts.add_argument('--disable-features=NetworkService')
    opts.add_argument('--disable-features=NetworkServiceInProcess')
    opts.add_argument('--disable-background-networking')
    opts.add_argument('--disable-background-timer-throttling')
    opts.add_argument('--disable-renderer-backgrounding')
    opts.add_argument('--disable-backgrounding-occluded-windows')

    # DNS fixes
    opts.add_argument('--no-proxy-server')
    opts.add_argument('--disable-async-dns')
    opts.add_argument('--disable-features=AsyncDNS,DnsOverHttps')

    # Window and user-agent
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')

    # Headless mode
    if os.environ.get('HEADLESS', '1') not in ('0', 'false', 'False'):
        opts.add_argument('--headless=new')

    opts.set_capability('browserName', 'chrome')

    try:
        print(f"Connecting to Selenium at {remote_url}", file=sys.stderr)
        driver = webdriver.Remote(command_executor=remote_url, options=opts)
        driver.set_page_load_timeout(300)  # 5 minutes
        print("Session successfully created!", file=sys.stderr)
        return driver
    except Exception as e:
        print("ERROR: Failed to create driver", file=sys.stderr)
        print(str(e), file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Minimal Selenium script: load a book from elvira.lib")
    parser.add_argument('--file', required=True, help="PDF file name (e.g., book1.pdf)")
    parser.add_argument('--url-base', default='http://elvira.lib/books', help="Base URL for books")
    parser.add_argument('--selenium-remote', default='http://localhost:4444', help="Selenium remote URL")
    parser.add_argument('--strategy', type=int, choices=[1,2,3], default=3, help="Strategy (not used yet)")
    parser.add_argument('--report', default=None, help="Report URL (not used yet)")
    args = parser.parse_args()

    target_url = args.url_base.rstrip('/') + '/' + args.file.lstrip('/')

    # Debug info to stderr (does not interfere with JSON parsing)
    print(f"Target URL: {target_url}", file=sys.stderr)

    driver = None
    success = False
    title = ""
    window_size = {}

    try:
        driver = create_driver(args.selenium_remote)

        print(f"Navigating to {target_url}...", file=sys.stderr)
        driver.get(target_url)

        title = driver.title
        window_size = driver.get_window_size()

        screenshot_path = "/tmp/book_screenshot.png"
        driver.save_screenshot(screenshot_path)
        print(f"Screenshot saved to {screenshot_path}", file=sys.stderr)

        success = True

    except Exception as e:
        print(f"Error loading page: {str(e)}", file=sys.stderr)
        success = False
    finally:
        if driver:
            print("Closing driver...", file=sys.stderr)
            driver.quit()
            print("Driver closed.", file=sys.stderr)

    # Final output — ONLY clean JSON to stdout (for TypeScript parsing)
    result = {
        "success": success,
        "url": target_url,
        "title": title,
        "window_size": window_size,
        "screenshot": screenshot_path if success else None,
        "strategy": args.strategy
    }
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()