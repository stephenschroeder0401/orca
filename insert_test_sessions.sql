-- Insert 15 test clock sessions
-- This script will automatically use your current user_id and client_id

DO $$
DECLARE
    v_user_id uuid;
    v_client_id uuid;
    v_property_id uuid;
    v_billing_id uuid;
BEGIN
    -- Get the most recent user_id from user_account (your user)
    SELECT user_id, client_id INTO v_user_id, v_client_id
    FROM public.user_account
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No user found in user_account table';
    END IF;

    RAISE NOTICE 'Using user_id: %, client_id: %', v_user_id, v_client_id;

    -- Get a property_id (optional, can be NULL)
    SELECT id INTO v_property_id
    FROM public.property
    WHERE is_deleted = false
    LIMIT 1;

    -- Get a billing_category_id (optional, can be NULL)
    SELECT id INTO v_billing_id
    FROM public.billing_account
    WHERE is_deleted = false
    LIMIT 1;

    -- Insert 15 clock sessions across different days

    -- Today (5 sessions)
    INSERT INTO orca.clock_sessions (user_id, client_id, start_time, end_time, notes, property_id, billing_category_id)
    VALUES
        (v_user_id, v_client_id, NOW() - INTERVAL '8 hours', NOW() - INTERVAL '6 hours 30 minutes', 'Morning meeting prep', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3 hours 15 minutes', 'Client consultation', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '45 minutes', 'Documentation work', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '5 minutes', 'Email responses', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '3 minutes', NULL, 'Currently working on project', v_property_id, v_billing_id);

    -- Yesterday (4 sessions)
    INSERT INTO orca.clock_sessions (user_id, client_id, start_time, end_time, notes, property_id, billing_category_id)
    VALUES
        (v_user_id, v_client_id, NOW() - INTERVAL '1 day 9 hours', NOW() - INTERVAL '1 day 6 hours', 'Property inspection', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '1 day 5 hours', NOW() - INTERVAL '1 day 3 hours 20 minutes', 'Tenant coordination', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '1 day 2 hours', NOW() - INTERVAL '1 day 1 hour', 'Maintenance scheduling', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '1 day 45 minutes', NOW() - INTERVAL '1 day 15 minutes', 'Budget review', v_property_id, v_billing_id);

    -- 2 days ago (3 sessions)
    INSERT INTO orca.clock_sessions (user_id, client_id, start_time, end_time, notes, property_id, billing_category_id)
    VALUES
        (v_user_id, v_client_id, NOW() - INTERVAL '2 days 8 hours', NOW() - INTERVAL '2 days 5 hours', 'Lease renewals', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '2 days 4 hours', NOW() - INTERVAL '2 days 2 hours 30 minutes', 'Financial reporting', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '2 days 1 hour', NOW() - INTERVAL '2 days 20 minutes', 'Vendor meetings', v_property_id, v_billing_id);

    -- 3 days ago (2 sessions)
    INSERT INTO orca.clock_sessions (user_id, client_id, start_time, end_time, notes, property_id, billing_category_id)
    VALUES
        (v_user_id, v_client_id, NOW() - INTERVAL '3 days 7 hours', NOW() - INTERVAL '3 days 4 hours', 'Property marketing', v_property_id, v_billing_id),
        (v_user_id, v_client_id, NOW() - INTERVAL '3 days 3 hours', NOW() - INTERVAL '3 days 1 hour 45 minutes', 'Contract negotiations', v_property_id, v_billing_id);

    -- 5 days ago (1 session)
    INSERT INTO orca.clock_sessions (user_id, client_id, start_time, end_time, notes, property_id, billing_category_id)
    VALUES
        (v_user_id, v_client_id, NOW() - INTERVAL '5 days 6 hours', NOW() - INTERVAL '5 days 3 hours', 'Strategic planning session', v_property_id, v_billing_id);

    RAISE NOTICE 'Successfully inserted 15 test clock sessions!';
END $$;
