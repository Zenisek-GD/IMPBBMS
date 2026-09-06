import "./config/developmentOnly.js";
// Dev helper for walking the prototype through screenshots without a phone.
// Demo database only. Two modes:
//   node demo-login-helper.mjs list           -> role, email, enrolled?
//   node demo-login-helper.mjs <email>        -> current authenticator code
import './config/env.js'
import { User } from './models/userModel.js'
import { Role } from './models/roleModel.js'
import { MfaEnrollment, decryptSecret } from './models/mfaModel.js'
import { generateToken } from './services/totp.js'

const arg = process.argv[2]

if (arg === 'list') {
  const users = await User.findAll({ include: [{ model: Role }], order: [['id', 'ASC']] })
  for (const u of users) {
    const e = await MfaEnrollment.findOne({ where: { userId: u.id } })
    console.log(`${u.Role?.key ?? '?'}\t${u.email}\t${e ? 'ENROLLED' : 'not-enrolled'}`)
  }
  process.exit(0)
}

const user = await User.findOne({ where: { email: arg } })
if (!user) {
  console.log('NO_USER')
  process.exit(0)
}
const enrollment = await MfaEnrollment.findOne({ where: { userId: user.id } })
if (!enrollment) {
  console.log('NOT_ENROLLED')
  process.exit(0)
}
console.log('CODE=' + generateToken(decryptSecret(enrollment.encryptedSecret)))
process.exit(0)
