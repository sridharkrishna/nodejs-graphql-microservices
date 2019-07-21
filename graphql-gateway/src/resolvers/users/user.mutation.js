import bcrypt from 'bcryptjs'

import { isString, isNumber } from 'lodash'

import authUtils from '../../utils/auth'
import passwordUtils from '../../utils/password'

const UserMutation = {
  async signup(parent, { data }, { userService, logger }) {
    logger.info('UserMutation#signup.call', data)

    const userExists = (await userService.count({ where: { email: data.email } })) >= 1

    logger.info('UserMutation#signup.check', userExists)

    if (userExists) {
      throw new Error('Email taken')
    }

    const password = await passwordUtils.hashPassword(data.password)

    const user = await userService.create({
      ...data,
      password
    })

    delete user.password

    logger.info('UserMutation#signup.result', user)

    return {
      user,
      token: authUtils.generateToken(user.id)
    }
  },
  async login(parent, { data }, { userService, logger }) {
    logger.info('UserQuery#login.call', data)

    const user = await userService.findOne({
      where: {
        email: data.email
      }
    })

    logger.info('UserQuery#login.check1', !user)

    if (!user) {
      throw new Error('Unable to login')
    }

    const isMatch = await bcrypt.compare(data.password, user.password)

    logger.info('UserQuery#login.check2', !user)

    if (!isMatch) {
      throw new Error('Unable to login')
    }

    delete user.password

    logger.info('UserQuery#login.result', user)

    return {
      user,
      token: authUtils.generateToken(user.id)
    }
  },
  async updateProfile(parent, { data }, { request, userService, logger }) {
    logger.info('UserMutation#updateProfile.call', data)

    const id = await authUtils.getUser(request)
    const user = await userService.findOne({ where: { id } })

    logger.info('UserMutation#updateProfile.target', user)

    if (!user) {
      throw new Error('User profile not found')
    }

    if (isString(data.name)) {
      user.name = data.name
    }

    if (isNumber(data.age)) {
      user.age = data.age
    }

    const updatedUser = await userService.update(id, user)

    delete updatedUser.password

    logger.info('UserMutation#updateProfile.result', updatedUser)

    return updatedUser
  },
  async updateEmail(parent, { data }, { request, userService, logger }) {
    logger.info('UserMutation#updateEmail.call', data)

    const id = await authUtils.getUser(request)
    const user = await userService.findOne({ where: { id } })
    const isMatch = await bcrypt.compare(data.currentPassword, user.password)

    logger.info('UserMutation#updateEmail.target', user)
    logger.info('UserMutation#updateEmail.check1', !user || !isMatch)

    if (!user || !isMatch) {
      throw new Error('Error updating email. Kindly check the email or password provided')
    }

    const userExists = (await userService.count({ where: { email: data.email } })) >= 1

    logger.info('UserMutation#updateEmail.check2', userExists)

    if (userExists) {
      throw new Error('Email taken')
    }

    user.email = data.email

    const updatedUser = await userService.update(id, user)

    delete updatedUser.password

    logger.info('UserMutation#updateEmail.result', updatedUser)

    return {
      updatedUser,
      token: authUtils.generateToken(user.id)
    }
  },
  async updatePassword(parent, { data }, { request, userService, logger }) {
    logger.info('UserMutation#updatePassword.call', data)

    const id = await authUtils.getUser(request)
    const user = await userService.findOne({ where: { id } })
    const isMatch = await bcrypt.compare(data.currentPassword, user.password)
    const isConfirmed = data.newPassword === data.confirmPassword

    logger.info('UserMutation#updatePassword.target', user)
    logger.info('UserMutation#updatePassword.check', !user || !isMatch || !isConfirmed)

    if (!user || !isMatch || !isConfirmed) {
      throw new Error('Error updating password. Kindly check your passwords.')
    }

    const password = await passwordUtils.hashPassword(data.password)

    const updatedUser = await userService.update(id, {
      ...user,
      password
    })

    delete updatedUser.password

    logger.info('UserMutation#updatePassword.result', updatedUser)

    return {
      updatedUser,
      token: authUtils.generateToken(user.id)
    }
  },
  async deleteAccount(parent, args, { request, commentService, postService, userService, logger }) {
    logger.info('UserMutation#deleteAccount.call')

    const id = await authUtils.getUser(request)
    const user = await userService.findOne({ where: { id } })

    logger.info('UserMutation#deleteAccount.check1', !user)

    if (!user) {
      throw new Error('User not found')
    }

    const postExists = (await postService.count({ where: { author: id } })) >= 1
    const commentExists = (await commentService.count({ where: { author: id } })) >= 1

    logger.info('UserMutation#deleteAccount.check1', postExists || commentExists)

    if (postExists || commentExists) {
      throw new Error('You have already made posts and comments. Kindly delete those first.')
    }

    const count = await userService.destroy(id)

    delete user.password

    logger.info('UserMutation#deleteAccount.result', count, user)

    return count
  }
}

export default UserMutation
