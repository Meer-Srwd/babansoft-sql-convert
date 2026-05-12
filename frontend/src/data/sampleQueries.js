export const sampleQueries = {
  postgresql: [
    {
      label: 'Pagination',
      query: 'SELECT id, email, NOW() AS generated_at FROM users WHERE is_active = TRUE LIMIT 10;'
    },
    {
      label: 'Create table',
      query:
        'CREATE TABLE "customers" (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT NOW());'
    },
    {
      label: 'Search',
      query: 'SELECT "firstName", "lastName" FROM "users" WHERE "lastName" ILIKE \'s%\' LIMIT 5;'
    }
  ],
  mysql: [
    {
      label: 'Pagination',
      query: 'SELECT id, email, NOW() AS generated_at FROM `users` WHERE is_active = TRUE LIMIT 10;'
    },
    {
      label: 'Create table',
      query:
        'CREATE TABLE `customers` (id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at DATETIME DEFAULT NOW());'
    },
    {
      label: 'Engine clause',
      query:
        'CREATE TABLE `events` (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120), is_live TINYINT(1) DEFAULT 0) ENGINE=InnoDB;'
    }
  ],
  sqlserver: [
    {
      label: 'Top query',
      query: 'SELECT TOP 10 [id], [email], GETDATE() AS generated_at FROM [users] WHERE [is_active] = 1;'
    },
    {
      label: 'Create table',
      query:
        'CREATE TABLE [customers] ([id] INT IDENTITY(1,1) PRIMARY KEY, [email] VARCHAR(255) NOT NULL, [is_active] BIT DEFAULT 1, [created_at] DATETIME DEFAULT GETDATE());'
    },
    {
      label: 'Distinct',
      query: 'SELECT DISTINCT TOP (5) [name] FROM [products] WHERE [is_featured] = 1;'
    }
  ]
};
