import bcrypt from 'bcryptjs';
import { pool, closeDatabase } from '../config/database.js';

const DEFAULT_PASSWORD = '123456';

const admins = [
  { full_name: 'Deborah Joyce',   email: 'joyce@taskteltechnologees.com',           department: 'Backend' },
  { full_name: 'Nagaraj M',       email: 'nagaraj@taskteltechnologees.com',         department: 'Engineer' },
  { full_name: 'Sachith Kumar J', email: 'sachith@taskteltechnologees.com',         department: 'Service' },
  { full_name: 'Geetha K',        email: 'customersupport@taskteltechnologees.com', department: 'Backend' },
  { full_name: 'N R Sundar',      email: 'sundar@taskteltechnologees.com',          department: 'Management' },
  { full_name: 'Balaji N R',      email: 'balaji@taskteltechnologees.com',          department: 'Management' },
  { full_name: 'Kanchana',        email: 'kanchana90141@gmail.com',                 department: 'Management' },
];

const technicians = [
  { full_name: 'Sandeep M',         email: 'design@taskteltechnologees.com',    role: 'AV CAD Designer',    category: 'Design',   city: 'Bengaluru' },
  { full_name: 'Varun Bellary',     email: 'varun@taskteltechnologees.com',     role: 'AV Project Manager', category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Venkatesh S',       email: 's.venkatesh@taskteltechnologees.com',role: 'AV Project Manager', category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Siddaram',          email: 'siddaram@taskteltechnologees.com',  role: 'AV Project Manager', category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Manohar S',         email: 'manohar@taskteltechnologees.com',   role: 'Service Engineer',   category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Murugan',           email: 'murugan@taskteltechnologees.com',   role: 'Service Engineer',   category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Mehboob Idrisi',    email: 'mehboob@taskteltechnologees.com',   role: 'AV Engineer',        category: 'Engineer', city: 'Mumbai' },
  { full_name: 'Arbaaz Khan',       email: 'arbaaz@taskteltechnologees.com',    role: 'AV Engineer',        category: 'Engineer', city: 'Mumbai' },
  { full_name: 'Balaji M',          email: 'balaji.m@taskteltechnologees.com',  role: 'Team Lead',          category: 'Engineer', city: 'Chennai' },
  { full_name: 'Logesh R',          email: 'logesh@taskteltechnologees.com',    role: 'AV Team Lead',       category: 'Engineer', city: 'Chennai' },
  { full_name: 'Ruban R',           email: 'ruban@taskteltechnologees.com',     role: 'Sr. AV Engineer',    category: 'Engineer', city: 'Chennai' },
  { full_name: 'Sridhar R',         email: 'sridhar@taskteltechnologees.com',   role: 'Sr. AV Engineer',    category: 'Engineer', city: 'Chennai' },
  { full_name: 'Sarathi V',         email: 'sarathi@taskteltechnologees.com',   role: 'AV Engineer',        category: 'Engineer', city: 'Bengaluru' },
  { full_name: 'Devendiran',        email: 'deva@taskteltechnologees.com',      role: 'Service Engineer',   category: 'Engineer', city: 'Chennai' },
  { full_name: 'Richard Joseph Raj',email: 'richard@taskteltechnologees.com',   role: 'AV Engineer',        category: 'Engineer', city: 'Chennai' },
  { full_name: 'Akash V',           email: 'ncr@taskteltechnologees.com',       role: 'AV Engineer',        category: 'Engineer', city: 'Chennai / Gurgaon' },
  { full_name: 'Sandeep',           email: 'av.hyd@taskteltechnologees.com',    role: 'Technical Engineer', category: 'Engineer', city: 'Hyderabad' },
  { full_name: 'YC Vinay',          email: 'ycvinay3432@gmail.com',             role: 'AV Engineer',        category: 'Engineer', city: 'Bengaluru' },
];

async function run() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  let a = 0;
  for (const x of admins) {
    await pool.query(
      `INSERT INTO admins (email, password_hash, full_name, department)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(email))) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             full_name     = EXCLUDED.full_name,
             department     = EXCLUDED.department`,
      [x.email.trim().toLowerCase(), hash, x.full_name, x.department]
    );
    a++;
  }

  let t = 0;
  for (const x of technicians) {
    const roleTitle = `${x.role} — ${x.city}`;
    await pool.query(
      `INSERT INTO technicians (email, password_hash, full_name, role_title, specialization)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ((lower(email))) DO UPDATE
         SET password_hash  = EXCLUDED.password_hash,
             full_name      = EXCLUDED.full_name,
             role_title     = EXCLUDED.role_title,
             specialization = EXCLUDED.specialization`,
      [x.email.trim().toLowerCase(), hash, x.full_name, roleTitle, x.category]
    );
    t++;
  }

  console.log(`Upserted ${a} admins and ${t} technicians. Default password: ${DEFAULT_PASSWORD}`);
}

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDatabase());
