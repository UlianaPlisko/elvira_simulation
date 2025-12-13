FROM selenium/standalone-chrome:latest

USER root

RUN apt-get update && apt-get install -y python3 python3-pip curl iproute2
RUN apt-get install -y dnsutils net-tools
RUN pip3 install --no-cache-dir selenium requests


RUN mkdir -p /scripts

COPY scripts/run_selenium.py /scripts/run_selenium.py
COPY entrypoint.sh /entrypoint.sh

RUN chown -R seluser:seluser /scripts && chmod -R 755 /scripts
RUN chmod +x /entrypoint.sh

USER seluser

ENTRYPOINT ["/entrypoint.sh"]