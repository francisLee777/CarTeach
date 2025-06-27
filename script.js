const canvas = document.getElementById('parking-lot');
const ctx = canvas.getContext('2d');
const messageBox = document.getElementById('message-box');

const carWidth = 50;
const carHeight = 100;
// 汽车初始属性设置
let car = {
    x: canvas.width / 2 - carWidth / 2,
    y: canvas.height - carHeight - 10, // 将初始Y坐标设置在画布底部
    angle: Math.PI, // 车身角度
    steerAngle: 0, // 前轮转向角度
    speed: 0,
    acceleration: 1, // (像素/秒²)
    friction: 0.5,     // (像素/秒²)
    turnSpeed: 0.05, // 转向速度
    maxSteerAngle: 0.6, // 最大转向角，根据3.5倍车长转弯直径计算
    wheelbase: carHeight * 0.8 // 轴距
};

let maxSpeed = 20; // (像素/秒) - 最大速度 [可根据控制面板中的速度控制来调整]

let walls = [];
let wallHistory = []; // 新增：墙面历史记录，用于撤销
let redoHistory = []; // 新增：重做历史记录
let drawing = false;
let drawingRect = false; // 新增：绘制矩形模式
let startPoint = null;

const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

function drawCar() {
    // (car.x, car.y) is now the center of the rear axle.
    // We need to find the geometric center for rotation.
    const centerX = car.x + (car.wheelbase / 2) * Math.sin(car.angle);
    const centerY = car.y - (car.wheelbase / 2) * Math.cos(car.angle);

    ctx.save();
    ctx.translate(centerX, centerY); // Translate to the geometric center
    ctx.rotate(car.angle);
    ctx.fillStyle = 'blue';
    ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
    // 绘制车头、车尾和后视镜
    // 车头灯
    ctx.fillStyle = 'green'; // 将车灯颜色改为绿色
    ctx.fillRect(-carWidth / 2 + 5, -carHeight / 2 - 2, 10, 4);
    ctx.fillRect(carWidth / 2 - 15, -carHeight / 2 - 2, 10, 4);

    // 尾灯
    ctx.fillStyle = 'red';
    ctx.fillRect(-carWidth / 2 + 5, carHeight / 2 - 2, 10, 4);
    ctx.fillRect(carWidth / 2 - 15, carHeight / 2 - 2, 10, 4);

    // 后视镜
    ctx.fillStyle = 'gray';
    ctx.fillRect(-carWidth / 2 - 6, -carHeight / 2 + 20, 6, 15);
    ctx.fillRect(carWidth / 2, -carHeight / 2 + 20, 6, 15);

    // 绘制前轮 (为了可视化转向)
    ctx.save();
    ctx.translate(0, -car.wheelbase / 2); // 移动到前轴中心
    ctx.rotate(car.steerAngle); // 根据转向角度旋转
    ctx.fillStyle = 'darkgray';
    ctx.fillRect(-carWidth / 2 - 2, -10, carWidth / 2 - 8, 20); // 左前轮
    ctx.fillRect(10, -10, carWidth / 2 - 8, 20); // 右前轮
    ctx.restore();

    // 绘制车头车尾文字
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('头', 0, -carHeight / 2 + 20);
    ctx.fillText('尾', 0, carHeight / 2 - 10);

    ctx.restore();
}

function drawWalls() {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    walls.forEach(wall => {
        ctx.beginPath();
        ctx.moveTo(wall.x1, wall.y1);
        ctx.lineTo(wall.x2, wall.y2);
        ctx.stroke();
    });
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

let lastTime = 0;
function gameLoop(timestamp) {
    if (!lastTime) {
        lastTime = timestamp;
    }
    const deltaTime = (timestamp - lastTime) / 1000; // 转换为秒
    update(deltaTime);
    lastTime = timestamp;
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) { // 接收deltaTime
    // 1. 获取用户输入
    let accelerationInput = 0;
    if (keys.ArrowUp) accelerationInput = 1;
    if (keys.ArrowDown) accelerationInput = -1;

    let steerInput = 0;
    if (keys.ArrowLeft) steerInput = -1;
    if (keys.ArrowRight) steerInput = 1;

    // 2. 更新速度（后轮驱动）
    if (accelerationInput !== 0) {
        car.speed += car.acceleration * accelerationInput; // 移除deltaTime，简化加速模型
    } else {
        // 应用摩擦力
        if (car.speed > car.friction) {
            car.speed -= car.friction;
        } else if (car.speed < -car.friction) {
            car.speed += car.friction;
        } else {
            car.speed = 0;
        }
    }
    car.speed = Math.max(-maxSpeed, Math.min(maxSpeed, car.speed));

    // 3. 更新转向角度（前轮转向）
    if (steerInput !== 0) {
        car.steerAngle += steerInput * car.turnSpeed;
    } else {
        // 方向盘自动回正
        if (car.steerAngle > car.turnSpeed) {
            car.steerAngle -= car.turnSpeed;
        } else if (car.steerAngle < -car.turnSpeed) {
            car.steerAngle += car.turnSpeed;
        } else {
            car.steerAngle = 0;
        }
    }
    car.steerAngle = Math.max(-car.maxSteerAngle, Math.min(car.maxSteerAngle, car.steerAngle));

    // 4. 更新车辆位置和角度 (基于自行车模型)
    if (car.speed !== 0) {
        const distance = car.speed * deltaTime;

        // 1. 先根据当前角度移动车辆
        car.x += distance * Math.sin(car.angle);
        car.y -= distance * Math.cos(car.angle);

        // 2. 再根据转向更新角度，为下一帧做准备
        car.angle += (car.speed / car.wheelbase) * Math.tan(car.steerAngle) * deltaTime;
    }

    clearCanvas();

    // 绘制预览墙
    if (drawing && startPoint && currentMousePos) {
        ctx.strokeStyle = 'lightgray';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(currentMousePos.x, currentMousePos.y);
        ctx.stroke();
    }

    // 新增：绘制预览矩形
    if (drawingRect && startPoint && currentMousePos) {
        ctx.strokeStyle = 'lightgray';
        ctx.lineWidth = 2;
        ctx.strokeRect(startPoint.x, startPoint.y, currentMousePos.x - startPoint.x, currentMousePos.y - startPoint.y);
    }

    drawWalls();
    drawCar();

    // 绘制预览车
    if (settingCar && currentMousePos) {
        ctx.save();
        ctx.translate(currentMousePos.x, currentMousePos.y);
        ctx.globalAlpha = 0.5; // 半透明
        ctx.fillStyle = 'blue';
        ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
        ctx.restore();
    }

    if (checkCollision()) {
        messageBox.textContent = '发生碰撞！请重新开始练习。';
        messageBox.style.borderColor = 'red';
        // 停止汽车移动
        car.speed = 0;
        car.turnSpeed = 0;
    } else {
        messageBox.textContent = '';
        messageBox.style.borderColor = 'transparent';
    }
}

function moveCar(e) {
    // 这个函数现在只用于启动和停止，实际移动在update中处理
}

function getCarCorners() {
    const corners = [];
    // (car.x, car.y) is the rear axle. Find the geometric center.
    const centerX = car.x + (car.wheelbase / 2) * Math.sin(car.angle);
    const centerY = car.y - (car.wheelbase / 2) * Math.cos(car.angle);

    const halfWidth = carWidth / 2;
    const halfHeight = carHeight / 2;

    // 矩形的四个角点相对于中心的坐标
    const points = [
        { x: -halfWidth, y: -halfHeight }, // 左上
        { x: halfWidth, y: -halfHeight },  // 右上
        { x: halfWidth, y: halfHeight },   // 右下
        { x: -halfWidth, y: halfHeight }    // 左下
    ];

    points.forEach(point => {
        // 旋转角点
        const rotatedX = point.x * Math.cos(car.angle) - point.y * Math.sin(car.angle);
        const rotatedY = point.x * Math.sin(car.angle) + point.y * Math.cos(car.angle);

        // 平移到汽车的实际位置
        corners.push({
            x: rotatedX + centerX,
            y: rotatedY + centerY
        });
    });

    return corners;
}

function lineLineIntersection(p1, p2, p3, p4) {
    const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (den === 0) {
        return false;
    }

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;

    return t > 0 && t < 1 && u > 0 && u < 1;
}

function checkCollision() {
    const carCorners = getCarCorners();

    // 检查汽车与画布边界的碰撞
    for (const corner of carCorners) {
        if (corner.x < 0 || corner.x > canvas.width || corner.y < 0 || corner.y > canvas.height) {
            return true;
        }
    }

    // 检查汽车与墙壁的碰撞
    for (const wall of walls) {
        for (let i = 0; i < carCorners.length; i++) {
            const p1 = carCorners[i];
            const p2 = carCorners[(i + 1) % carCorners.length];
            if (lineLineIntersection(p1, p2, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 })) {
                return true;
            }
        }
    }

    return false;
}

function restart() {
    car.x = canvas.width / 2; // 后轴中心X
    car.y = canvas.height - 100; // 后轴中心Y
    car.angle = Math.PI; // 确保重置时角度为180度（车头向下）
    car.speed = 0;
    car.steerAngle = 0; // 重置转向角
    walls = [];
    wallHistory = [];
    redoHistory = [];
    // update(); // 移除：不应在此处直接调用update，gameLoop会处理
}

function randomWalls() {
    walls = [];
    wallHistory = [];
    redoHistory = [];
    const padding = 50;
    const numWalls = 5;

    // 创建一些水平和垂直的墙
    for (let i = 0; i < numWalls; i++) {
        const isHorizontal = Math.random() > 0.5;
        if (isHorizontal) {
            const y = padding + Math.random() * (canvas.height - 2 * padding);
            const x1 = padding + Math.random() * (canvas.width / 2 - padding);
            const x2 = canvas.width / 2 + Math.random() * (canvas.width / 2 - padding);
            walls.push({ x1, y1: y, x2, y2: y });
        } else {
            const x = padding + Math.random() * (canvas.width - 2 * padding);
            const y1 = padding + Math.random() * (canvas.height / 2 - padding);
            const y2 = canvas.height / 2 + Math.random() * (canvas.height / 2 - padding);
            walls.push({ x1: x, y1, x2: x, y2 });
        }
    }
    wallHistory = [...walls];
    // update(); // 移除：不应在此处直接调用update，gameLoop会处理
}

function randomCar() {
    // 随机设置中心点
    const centerX = Math.random() * (canvas.width - carWidth) + carWidth / 2;
    const centerY = Math.random() * (canvas.height - carHeight) + carHeight / 2;
    car.angle = Math.random() * 2 * Math.PI;

    // 根据中心点和角度计算后轴位置
    car.x = centerX - (car.wheelbase / 2) * Math.sin(car.angle);
    car.y = centerY + (car.wheelbase / 2) * Math.cos(car.angle);
    // update(); // 移除：不应在此处直接调用update，gameLoop会处理
}

function isPointInCar(px, py) {
    // (car.x, car.y) is the rear axle. Find the geometric center.
    const centerX = car.x + (car.wheelbase / 2) * Math.sin(car.angle);
    const centerY = car.y - (car.wheelbase / 2) * Math.cos(car.angle);

    // 将点击坐标转换到以汽车中心为原点的坐标系
    const dx = px - centerX;
    const dy = py - centerY;

    // 旋转坐标
    const rotatedX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
    const rotatedY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);

    // 判断是否在矩形内
    return Math.abs(rotatedX) < carWidth / 2 && Math.abs(rotatedY) < carHeight / 2;
}

function handleCanvasClick(e) {
    // 移除了点击车辆掉头的逻辑，因为它与新的转向模型冲突

    if (drawing) {
        if (!startPoint) {
            startPoint = { x: e.offsetX, y: e.offsetY };
        } else {
            const newWall = { x1: startPoint.x, y1: startPoint.y, x2: e.offsetX, y2: e.offsetY };
            walls.push(newWall);
            wallHistory.push(newWall);
            redoHistory = []; // 清空重做历史
            startPoint = null;
            // update(); // 移除：不应在此处直接调用update，gameLoop会处理
        }
    } else if (drawingRect) { // 新增：处理矩形绘制
        if (!startPoint) {
            startPoint = { x: e.offsetX, y: e.offsetY };
        } else {
            const endPoint = { x: e.offsetX, y: e.offsetY };
            const x1 = Math.min(startPoint.x, endPoint.x);
            const y1 = Math.min(startPoint.y, endPoint.y);
            const x2 = Math.max(startPoint.x, endPoint.x);
            const y2 = Math.max(startPoint.y, endPoint.y);

            const rectWalls = [
                { x1: x1, y1: y1, x2: x2, y2: y1 }, // Top
                { x1: x2, y1: y1, x2: x2, y2: y2 }, // Right
                { x1: x2, y1: y2, x2: x1, y2: y2 }, // Bottom
                { x1: x1, y1: y2, x2: x1, y2: y1 }  // Left
            ];

            walls.push(...rectWalls);
            wallHistory.push(...rectWalls);
            redoHistory = [];
            startPoint = null;
        }
    } else if (isPointInCar(e.offsetX, e.offsetY)) {
        // 点击汽车时反转方向
        car.angle += Math.PI;
    } else if (settingCar) {
        // 用户点击设置的是车辆中心点
        const centerX = e.offsetX;
        const centerY = e.offsetY;
        // 根据中心点和当前角度计算后轴位置
        car.x = centerX - (car.wheelbase / 2) * Math.sin(car.angle);
        car.y = centerY + (car.wheelbase / 2) * Math.cos(car.angle);
        settingCar = false;
        canvas.style.cursor = 'default';
        // update(); // 移除：不应在此处直接调用update，gameLoop会处理
    }
}

let currentMousePos = null;
function handleMouseMove(e) {
    currentMousePos = { x: e.offsetX, y: e.offsetY };
}

let settingCar = false;

document.getElementById('draw-walls-btn').addEventListener('click', () => {
    drawing = true;
    settingCar = false;
    canvas.style.cursor = 'crosshair';
    messageBox.textContent = '点击画布两次以绘制一堵墙。';
});

document.getElementById('draw-rect-btn').addEventListener('click', () => {
    drawing = false;
    drawingRect = true;
    settingCar = false;
    canvas.style.cursor = 'crosshair';
    messageBox.textContent = '点击画布两次以定义矩形的对角。';
});

document.getElementById('finish-drawing-btn').addEventListener('click', () => {
    drawing = false;
    drawingRect = false; // 新增：完成时也禁用矩形模式
    canvas.style.cursor = 'default';
    messageBox.textContent = '';
});

document.getElementById('undo-wall-btn').addEventListener('click', () => {
    if (walls.length > 0) {
        const lastWall = walls.pop();
        redoHistory.push(lastWall);
        wallHistory.pop(); // 同步更新wallHistory
    }
});

document.getElementById('redo-wall-btn').addEventListener('click', () => {
    if (redoHistory.length > 0) {
        const nextWall = redoHistory.pop();
        walls.push(nextWall);
        wallHistory.push(nextWall); // 同步更新wallHistory
    }
});

document.getElementById('speed-slider').addEventListener('input', (e) => {
    // 滑块范围1-5
    maxSpeed = parseFloat(e.target.value) * 10;
});

document.getElementById('random-walls-btn').addEventListener('click', randomWalls);

document.getElementById('set-car-btn').addEventListener('click', () => {
    settingCar = true;
    drawing = false;
    canvas.style.cursor = 'pointer';
    messageBox.textContent = '点击画布以设置汽车的初始位置。';
});

// 移除随机生成汽车按钮的事件监听
// document.getElementById('random-car-btn').addEventListener('click', randomCar);

document.getElementById('restart-btn').addEventListener('click', restart);

canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('click', handleCanvasClick);

document.addEventListener('keydown', (e) => {
    if (e.key in keys) {
        keys[e.key] = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key in keys) {
        keys[e.key] = false;
    }
});

// --- 存档/读档功能 ---
function saveState(slot) {
    const gameState = {
        car: car,
        walls: walls,
        wallHistory: wallHistory,
        redoHistory: redoHistory
    };
    localStorage.setItem(`parking_lot_save_${slot}`, JSON.stringify(gameState));
    messageBox.textContent = `游戏状态已保存到存档 ${slot}。`;
    messageBox.style.borderColor = 'green';
}

function loadState(slot) {
    const savedState = localStorage.getItem(`parking_lot_save_${slot}`);
    if (savedState) {
        const gameState = JSON.parse(savedState);
        car = gameState.car;
        walls = gameState.walls;
        wallHistory = gameState.wallHistory;
        redoHistory = gameState.redoHistory;
        messageBox.textContent = `已从存档 ${slot} 加载游戏状态。`;
        messageBox.style.borderColor = 'blue';
    } else {
        messageBox.textContent = `存档 ${slot} 为空。`;
        messageBox.style.borderColor = 'orange';
    }
}

document.querySelectorAll('.save-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const slot = e.target.dataset.slot;
        saveState(slot);
    });
});

document.querySelectorAll('.load-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const slot = e.target.dataset.slot;
        loadState(slot);
    });
});


// 初始化
restart();
gameLoop(0); // 启动游戏循环