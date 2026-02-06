# Multi-stage build: builder stage
FROM rust:1-bookworm AS builder

WORKDIR /app

# Copy source code and configuration
COPY . .

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install ca-certificates
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the built binary from builder stage
COPY --from=builder /app/target/release/backend-rust /app/backend

# Set environment variables
ENV RUST_LOG=info
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the binary
CMD ["/app/backend"]