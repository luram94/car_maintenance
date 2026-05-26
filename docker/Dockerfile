FROM node:20-alpine

WORKDIR /app

# Install the only dev dep globally so bind-mounting /app does not hide it.
RUN npm install -g http-server@14.1.1

EXPOSE 8000

CMD ["http-server", "docs", "-p", "8000", "-c-1", "-a", "0.0.0.0"]
