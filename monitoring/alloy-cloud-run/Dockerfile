FROM grafana/alloy:latest

COPY config.alloy /etc/alloy/config.alloy

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["exec /bin/alloy run --server.http.listen-addr=0.0.0.0:${PORT:-8080} /etc/alloy/config.alloy"]
