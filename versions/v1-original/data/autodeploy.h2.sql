-- MVStore
CREATE ALIAS IF NOT EXISTS READ_BLOB_MAP FOR 'org.h2.tools.Recover.readBlobMap';
CREATE ALIAS IF NOT EXISTS READ_CLOB_MAP FOR 'org.h2.tools.Recover.readClobMap';
// error: org.h2.mvstore.MVStoreException: The read format 2 is smaller than the supported format 3 [2.2.224/5]
