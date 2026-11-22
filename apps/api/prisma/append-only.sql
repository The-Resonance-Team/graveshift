-- Canonical append-only SQL. The drift check verifies this block is unchanged.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_entries is append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_entries_no_update
BEFORE UPDATE ON audit_entries
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();

CREATE TRIGGER audit_entries_no_delete
BEFORE DELETE ON audit_entries
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
