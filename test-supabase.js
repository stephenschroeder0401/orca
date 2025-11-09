// Test Supabase connection from Node.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing Supabase connection...\n');

  try {
    // Test 1: Get session (should work even without auth)
    console.log('1. Testing auth session...');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.log('   ⚠️  Session error:', sessionError.message);
    } else {
      console.log('   ✅ Auth working (no active session)');
    }

    // Test 2: Query public tables
    console.log('\n2. Testing database query...');
    const { data, error } = await supabase
      .from('employee')
      .select('*')
      .limit(5);

    if (error) {
      console.log('   ❌ Query error:', error.message);
    } else {
      console.log(`   ✅ Query successful! Found ${data.length} employees`);
      if (data.length > 0) {
        console.log('   First employee:', data[0]);
      }
    }

    // Test 3: Check for orca schema tables
    console.log('\n3. Checking for orca schema...');
    const { data: orcaData, error: orcaError } = await supabase
      .from('orca.clock_sessions')
      .select('*')
      .limit(1);

    if (orcaError) {
      if (orcaError.message.includes('does not exist')) {
        console.log('   ℹ️  Orca schema not created yet (expected)');
      } else {
        console.log('   ⚠️  Error:', orcaError.message);
      }
    } else {
      console.log('   ✅ Orca schema exists!');
    }

  } catch (err) {
    console.log('   ❌ Connection error:', err.message);
  }

  console.log('\n✅ Test complete!\n');
}

testConnection();
