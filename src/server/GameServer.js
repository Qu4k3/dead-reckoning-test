const randomColor = require('randomcolor')
const { calculatePlayerAcceleration } = require('../common/utils.js')

const {
  PLAYER_EDGE,
  COIN_RADIUS
} = require('../common/constants.js')

class GameServer {
  constructor (io, gameId) {
    this.io = io
    this.roomId = gameId
    this.players = {}
    this.coins = {}
    this.nextCoinId = 0
    this.lastCoinSpawn = Date.now()
    this.lastLogic = Date.now()

    for (let i = 0; i < 10; ++i) {
      const coin = {
        id: this.nextCoinId++,
        x: Math.random() * 500,
        y: Math.random() * 500
      }
      this.coins[coin.id] = coin
    }
  }

  onPlayerConnected (socket) {
    console.log(`${socket.id} connected to game ${this.roomId}`)
    socket.join(this.roomId)

    const inputs = {
      LEFT_ARROW: false,
      RIGHT_ARROW: false,
      UP_ARROW: false,
      DOWN_ARROW: false
    }

    const player = {
      x: Math.random() * 500,
      y: Math.random() * 500,
      vx: 0,
      vy: 0,
      color: randomColor(),
      id: socket.id,
      score: 0,
      inputs
    }
    this.players[socket.id] = player

    socket.emit(
      'gameInit',
      socket.id,
      {
        players: this.players,
        coins: this.coins
      }
    )

    // so that the new players appears on other people's screen
    this.onPlayerMoved(socket, inputs)
  }

  onPlayerMoved (socket, inputs) {
    console.log(inputs)
    console.log(`${new Date()}: ${socket.id} moved`)
    const player = this.players[socket.id]
    player.timestamp = Date.now()
    player.inputs = inputs
    calculatePlayerAcceleration(player)
    this.io.to(this.roomId).emit('playerMoved', player)
  }

  onPlayerDisconnected (socket) {
    console.log(`${socket.id} disconnected`)
    delete this.players[socket.id]
    socket.to(this.roomId).broadcast.emit('playerDisconnected', socket.id)
  }

  logic () {
    const now = Date.now()

    for (let playerId in this.players) {
      const player = this.players[playerId]
      const { x, y, vx, vy, ax, ay } = player

      const delta = now - player.timestamp
      const delta2 = delta ** 2

      player.x = x + (vx * delta) + (ax * delta2 / 2)
      player.y = y + (vy * delta) + (ay * delta2 / 2)
      player.vx = vx + (ax * delta)
      player.vy = vy + (ay * delta)
      player.timestamp = now

      // player <-> coins collision detection
      for (let coinId in this.coins) {
        const coin = this.coins[coinId]
        const dist = Math.abs(player.x - coin.x) + Math.abs(player.y - coin.y)
        const radiusSum = COIN_RADIUS + (PLAYER_EDGE / 2)
        if (radiusSum > dist) {
          delete this.coins[coinId]
          player.score++
          this.io.to(this.roomId).emit('coinCollected', player.id, coinId)
        }
      }
    }

    // spawn coin every second
    if (Date.now() - this.lastCoinSpawn > 1000) {
      const coin = {
        id: this.nextCoinId++,
        x: Math.random() * 500,
        y: Math.random() * 500
      }
      this.coins[coin.id] = coin
      this.lastCoinSpawn = Date.now()
      this.io.to(this.roomId).emit('coinSpawned', coin)
    }
  }
}

module.exports = GameServer
