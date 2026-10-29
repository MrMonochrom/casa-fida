# The backup service in docker-compose.yml: MySQL's own client tools (to dump and load the
# database) and rclone (to copy backups to and from file storage), run by deploy/backup.sh.
FROM rclone/rclone:1.75.2 AS rclone

FROM mysql:8.4.13
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY deploy/backup.sh /usr/local/bin/backup
RUN chmod +x /usr/local/bin/backup
ENTRYPOINT ["backup"]
CMD ["schedule"]
