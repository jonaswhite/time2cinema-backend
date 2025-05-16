                                         Table "public.cinemas"
   Column    |            Type             | Collation | Nullable |               Default               
-------------+-----------------------------+-----------+----------+-------------------------------------
 id          | integer                     |           | not null | nextval('cinemas_id_seq'::regclass)
 name        | text                        |           | not null | 
 address     | text                        |           |          | 
 latitude    | double precision            |           |          | 
 longitude   | double precision            |           |          | 
 source      | text                        |           |          | 
 external_id | text                        |           |          | 
 created_at  | timestamp without time zone |           |          | CURRENT_TIMESTAMP
 updated_at  | timestamp without time zone |           |          | CURRENT_TIMESTAMP
 city        | text                        |           |          | 
 district    | text                        |           |          | 
 type        | text                        |           |          | 
Indexes:
    "cinemas_pkey" PRIMARY KEY, btree (id)
Referenced by:
    TABLE "showtimes" CONSTRAINT "showtimes_cinema_id_fkey" FOREIGN KEY (cinema_id) REFERENCES cinemas(id)

