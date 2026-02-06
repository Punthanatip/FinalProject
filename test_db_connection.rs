use sqlx::{PgPool, Row};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get database URL from environment or use default
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://fod:fodpass@localhost:5433/fod".to_string());

    println!("Testing database connection to: {}", database_url);

    // Create connection pool
    let pool = PgPool::connect(&database_url).await?;
    
    println!("✓ Successfully connected to the database!");

    // Test basic query
    let result: (i64,) = sqlx::query_as("SELECT 1")
        .fetch_one(&pool)
        .await?;
    
    println!("✓ Basic query test passed: {:?}", result.0);

    // Check if tables exist
    let table_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'events' OR table_name = 'fod_classes'"
    )
    .fetch_one(&pool)
    .await?;

    println!("✓ Found {} expected tables", table_count.0);

    // Check fod_classes table content
    let class_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM fod_classes")
        .fetch_one(&pool)
        .await?;
    
    println!("✓ fod_classes table has {} records", class_count.0);

    // Check events table
    let event_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM events")
        .fetch_one(&pool)
        .await?;
    
    println!("✓ events table has {} records", event_count.0);

    // Display some sample data from fod_classes if any exist
    if class_count.0 > 0 {
        let sample_classes: Vec<(i32, String)> = sqlx::query_as("SELECT id, name FROM fod_classes LIMIT 5")
            .fetch_all(&pool)
            .await?;
        
        println!("✓ Sample FOD classes (first 5):");
        for (id, name) in sample_classes {
            println!("  - ID: {}, Name: {}", id, name);
        }
    }

    pool.close().await;
    println!("\n✓ Database connection test completed successfully!");

    Ok(())
}