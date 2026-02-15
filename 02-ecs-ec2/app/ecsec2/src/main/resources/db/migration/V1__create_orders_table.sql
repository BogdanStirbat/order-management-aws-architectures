CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    version BIGINT NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL,

    total_amount NUMERIC(19, 2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT orders_status_check
        CHECK (status IN ('CREATED', 'CANCELLED'))
);
