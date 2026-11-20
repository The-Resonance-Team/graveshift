import { SQL } from 'bun';

export interface Candy {
  id: number;
  name: string;
  price: number | null;
}

export interface Db {
  ping(): Promise<boolean>;
  getCandy(id: number): Promise<Candy | null>;
  search(query: string): Promise<Candy[]>;
  nullifyPrice(id: number): Promise<void>;
  setIndexed(indexed: boolean): Promise<void>;
  restore(): Promise<void>;
}

const SEED: Candy[] = [
  { id: 1, name: 'Gummy Ghost', price: 1.5 },
  { id: 2, name: 'Candy Corn', price: 0.99 },
  { id: 3, name: 'Witch Fingers', price: 2.25 },
];

export function memoryDb(slowMs = 1800): Db {
  let rows = structuredClone(SEED);
  let indexed = true;
  return {
    ping: async () => true,
    getCandy: async (id) => rows.find((row) => row.id === id) ?? null,
    async search(query) {
      if (!indexed) await Bun.sleep(slowMs);
      return rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));
    },
    async nullifyPrice(id) {
      rows = rows.map((row) => (row.id === id ? { ...row, price: null } : row));
    },
    async setIndexed(value) {
      indexed = value;
    },
    async restore() {
      rows = structuredClone(SEED);
      indexed = true;
    },
  };
}

interface Row {
  id: number;
  name: string;
  price: string | null;
}
const toCandy = (row: Row): Candy => ({
  id: row.id,
  name: row.name,
  price: row.price === null ? null : Number(row.price),
});

export function pgDb(url: string, slowMs = 1800): Db {
  const sql = new SQL(url);
  let ready: Promise<void> | undefined;
  const init = () =>
    (ready ??= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS candies (id int PRIMARY KEY, name text NOT NULL, price numeric)`;
      await Promise.all(
        SEED.map(
          (candy) =>
            sql`INSERT INTO candies (id, name, price) VALUES (${candy.id}, ${candy.name}, ${candy.price}) ON CONFLICT (id) DO NOTHING`,
        ),
      );
      await sql`CREATE INDEX IF NOT EXISTS candies_name_idx ON candies (name)`;
    })());
  const hasIndex = async () =>
    (await sql`SELECT 1 FROM pg_indexes WHERE indexname = 'candies_name_idx'`).length > 0;

  return {
    async ping() {
      await init();
      await sql`SELECT 1`;
      return true;
    },
    async getCandy(id) {
      await init();
      const rows: Row[] = await sql`SELECT id, name, price FROM candies WHERE id = ${id}`;
      return rows[0] ? toCandy(rows[0]) : null;
    },
    async search(query) {
      await init();
      // ponytail: a missing index is simulated with pg_sleep, upgrade if the demo needs a real large-table scan
      const delay = (await hasIndex()) ? 0 : slowMs / 1000;
      const rows: Row[] =
        await sql`SELECT id, name, price, pg_sleep(${delay}) FROM candies WHERE name ILIKE ${`%${query}%`}`;
      return rows.map(toCandy);
    },
    async nullifyPrice(id) {
      await init();
      await sql`UPDATE candies SET price = NULL WHERE id = ${id}`;
    },
    async setIndexed(indexed) {
      await init();
      if (indexed) await sql`CREATE INDEX IF NOT EXISTS candies_name_idx ON candies (name)`;
      else await sql`DROP INDEX IF EXISTS candies_name_idx`;
    },
    async restore() {
      await init();
      await Promise.all(
        SEED.map((candy) => sql`UPDATE candies SET price = ${candy.price} WHERE id = ${candy.id}`),
      );
      await sql`CREATE INDEX IF NOT EXISTS candies_name_idx ON candies (name)`;
    },
  };
}
