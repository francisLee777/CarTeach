const canvas = document.getElementById('parking-lot');
const ctx = canvas.getContext('2d');
const messageBox = document.getElementById('message-box');

const carWidth = 50;
const carHeight = 100;
const  previewCanvasRate = 0.25; // 存档预览画布的比例

// 汽车初始属性设置
let car = {
    // 这里位置没有用，后面 restart 会修改
    x: 0,
    y: 0,
    angle: Math.PI, // 车头朝下
    speed: 0,

    // restart 不会修改
    acceleration: 2, // (像素/秒²)
    friction: 1,     // (像素/秒²)
    turnSpeed: 0.05, // 转向速度
    maxSteerAngle: 0.6, // 最大转向角，根据3.5倍车长转弯直径计算
    wheelbase: carHeight * 0.8 // 轴距
};

const baseMaxSpeed = 30; // 定义一个基础最大速度
let maxSpeed = baseMaxSpeed; // (像素/秒) - 最大速度 [可根据控制面板中的速度控制来调整]


let walls = [];
let wallHistory = []; // 新增：墙面历史记录，用于撤销
let redoHistory = []; // 新增：重做历史记录
let drawing = false;
let drawingRect = false;
let startPoint = null;
let wheelTracks = { fl: [], fr: [], rl: [], rr: [] }; // 新增：用于存储车轮轨迹

const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

function drawCar() {
    ctx.save();
    ctx.translate(car.x, car.y); // Translate to the geometric center
    ctx.rotate(car.angle);
    ctx.fillStyle = 'blue';
    ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);
    // 绘制车头、车尾和后视镜
    // 车头灯
    ctx.fillStyle = 'yellow'; // 将车灯颜色改为绿色
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
    const wheelWidth = carWidth / 2 - 10;
    const wheelHeight = 20;
    const frontAxleY = -car.wheelbase / 2;
    const backAxleY = car.wheelbase / 2;
    const leftWheelX = -carWidth / 2;
    const rightWheelX = 10;
    ctx.fillStyle = 'black';

    // 左前轮
    ctx.save();
    // 1. 移动到左前轮的旋转中心点
    ctx.translate(leftWheelX + wheelWidth / 2, frontAxleY + wheelHeight / 2);
    // 2. 旋转
    ctx.rotate(car.steerAngle);
    // 3. 以旋转中心为原点绘制轮胎
    ctx.fillRect(-wheelWidth / 2, -wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.restore();

    // 右前轮
    ctx.save();
    // 1. 移动到右前轮的旋转中心点
    ctx.translate(rightWheelX + wheelWidth / 2, frontAxleY + wheelHeight / 2);
    // 2. 旋转
    ctx.rotate(car.steerAngle);
    // 3. 以旋转中心为原点绘制轮胎
    ctx.fillRect(-wheelWidth / 2, -wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.restore();

    // 汽车的后轮不会转向，因此直接绘制
    const rearAxleY = car.wheelbase / 2;
    ctx.fillRect(leftWheelX, rearAxleY - wheelHeight / 2, wheelWidth, wheelHeight);
    ctx.fillRect(rightWheelX, rearAxleY - wheelHeight / 2, wheelWidth, wheelHeight);


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
        // The speed is applied at the rear axle.
        // We need to calculate the position of the rear axle based on the car's center (car.x, car.y) and angle.
        const rearAxleOffset = car.wheelbase / 2;
        const rearAxleX = car.x - rearAxleOffset * Math.sin(car.angle);
        const rearAxleY = car.y + rearAxleOffset * Math.cos(car.angle);

        // Now, update the rear axle's position based on speed and current angle.
        const distance = car.speed * deltaTime;
        const newRearAxleX = rearAxleX + distance * Math.sin(car.angle);
        const newRearAxleY = rearAxleY - distance * Math.cos(car.angle);

        // Update the car's main angle based on the turn.
        const newAngle = car.angle + (car.speed / car.wheelbase) * Math.tan(car.steerAngle) * deltaTime;

        // Finally, calculate the new geometric center based on the new rear axle position and new angle.
        car.x = newRearAxleX + rearAxleOffset * Math.sin(newAngle);
        car.y = newRearAxleY - rearAxleOffset * Math.cos(newAngle);
        car.angle = newAngle;

        // 新增：记录车轮轨迹
        if (document.getElementById('record-tracks-checkbox').checked) {
            const wheelPositions = getWheelPositions();
            wheelTracks.fl.push(wheelPositions.fl);
            wheelTracks.fr.push(wheelPositions.fr);
            wheelTracks.rl.push(wheelPositions.rl);
            wheelTracks.rr.push(wheelPositions.rr);
        }

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
    }else if(drawingRect && startPoint && currentMousePos) {
    // 新增：绘制预览矩形
        ctx.strokeStyle = 'lightgray';
        ctx.lineWidth = 2;
        ctx.strokeRect(startPoint.x, startPoint.y, currentMousePos.x - startPoint.x, currentMousePos.y - startPoint.y);
    }

    drawWheelTracks(); // 新增：绘制轨迹
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
        // car.turnSpeed = 0;
    } else {
        messageBox.textContent = '';
        messageBox.style.borderColor = 'transparent';
    }
}

// 新增：绘制车轮轨迹
function drawWheelTracks() {
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)'; // 浅灰色虚线
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 10]); // 5像素实线，10像素空白

    for (const wheelKey in wheelTracks) {
        const track = wheelTracks[wheelKey];
        if (track.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(track[0].x, track[0].y);
        for (let i = 1; i < track.length; i++) {
            ctx.lineTo(track[i].x, track[i].y);
        }
        ctx.stroke();
    }

    ctx.restore(); // 恢复绘图状态，不影响后续绘制
}

function getCarCorners() {
    const corners = [];
    // (car.x, car.y) is the geometric center.
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
            x: rotatedX + car.x,
            y: rotatedY + car.y
        });
    });

    return corners;
}

// 新增：获取四个车轮中心在世界坐标系中的位置
function getWheelPositions() {
    const wheelWidth = carWidth / 2 - 10;
    const frontAxleY = -car.wheelbase / 2;
    const rearAxleY = car.wheelbase / 2;
    const leftWheelX = -carWidth / 2;
    const rightWheelX = 10;

    // 车轮中心点相对于车辆中心的局部坐标
    const localPositions = {
        fl: { x: leftWheelX + wheelWidth / 2, y: frontAxleY },
        fr: { x: rightWheelX + wheelWidth / 2, y: frontAxleY },
        rl: { x: leftWheelX + wheelWidth / 2, y: rearAxleY },
        rr: { x: rightWheelX + wheelWidth / 2, y: rearAxleY }
    };

    // 将局部坐标转换为世界坐标的辅助函数
    const toWorld = (localPoint) => {
        const rotatedX = localPoint.x * Math.cos(car.angle) - localPoint.y * Math.sin(car.angle);
        const rotatedY = localPoint.x * Math.sin(car.angle) + localPoint.y * Math.cos(car.angle);
        return { x: rotatedX + car.x, y: rotatedY + car.y };
    };

    return {
        fl: toWorld(localPositions.fl),
        fr: toWorld(localPositions.fr),
        rl: toWorld(localPositions.rl),
        rr: toWorld(localPositions.rr)
    };
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
    car.x = canvas.width / 2;
    car.y = canvas.height/2; // Y坐标现在是车的中心
    car.angle = Math.PI; // 车头朝下
    car.speed = 0;
    car.steerAngle = 0; // 重置转向角
    walls = [];
    wallHistory = [];
    redoHistory = [];
    wheelTracks = { fl: [], fr: [], rl: [], rr: [] }; // 新增：清除轨迹
    document.getElementById('record-tracks-checkbox').checked = false; // 新增：取消勾选复选框
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
    // 将点击坐标转换到以汽车中心为原点的坐标系
    const dx = px - car.x;
    const dy = py - car.y;

    // 旋转坐标
    const rotatedX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
    const rotatedY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);

    // 判断是否在矩形内
    return Math.abs(rotatedX) < carWidth / 2 && Math.abs(rotatedY) < carHeight / 2;
}

function handleCanvasClick(e) {
    console.log("Canvas clicked at:", e.offsetX, e.offsetY," car  的",car.x,car.y);
    // 画直线
    if (drawing) {
        if (!startPoint) {
            startPoint = { x: e.offsetX, y: e.offsetY };
        } else {
            const newWall = { x1: startPoint.x, y1: startPoint.y, x2: e.offsetX, y2: e.offsetY };
            walls.push(newWall);
            wallHistory.push(newWall);
            redoHistory = []; // 清空重做历史
            startPoint = null;
        }
        // 画矩形
    } else if (drawingRect) { 
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
        car.x = e.offsetX;
        car.y = e.offsetY;
        car.angle = 0;
        settingCar = false;
        canvas.style.cursor = 'default';
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

document.getElementById('speed-multiplier-input').addEventListener('input', (e) => {
    const multiplier = parseFloat(e.target.value);
    // 验证输入值在1到10之间
    if (!isNaN(multiplier) && multiplier >= 1 && multiplier <= 10) {
        maxSpeed = baseMaxSpeed * multiplier;
    }
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

window.addEventListener('keydown', (e) => {
    if (e.key in keys) {
        // 阻止上下箭头键的默认滚动行为
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
        }
        keys[e.key] = true;
    }
});

document.getElementById('record-tracks-checkbox').addEventListener('change', (e) => {
    if (!e.target.checked) {
        // 当取消勾选时，清除轨迹
        wheelTracks = { fl: [], fr: [], rl: [], rr: [] };
        messageBox.textContent = '车轮轨迹已清除。';
        messageBox.style.borderColor = 'blue';
        setTimeout(() => {
            if (messageBox.textContent === '车轮轨迹已清除。') {
                messageBox.textContent = '';
                messageBox.style.borderColor = 'transparent';
            }
        }, 2000);
    } else {
        // 当勾选时，给一个提示
        messageBox.textContent = '开始记录车轮轨迹。';
        messageBox.style.borderColor = 'blue';
        setTimeout(() => {
            if (messageBox.textContent === '开始记录车轮轨迹。') {
                messageBox.textContent = '';
                messageBox.style.borderColor = 'transparent';
            }
        }, 2000);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key in keys) {
        keys[e.key] = false;
    }
});

// --- 存档/读档功能 ---
function saveState(slot, force = false) {
    const saveData = localStorage.getItem(`parking_lot_save_${slot}`);
    if (saveData && !force) {
        if (confirm(`存档 ${slot} 已有内容，是否覆盖？`)) {
            // 用户确认覆盖
            saveState(slot, true); // 强制保存
        } else {
            // 用户取消
            messageBox.textContent = `取消覆盖存档 ${slot}。`;
            messageBox.style.borderColor = 'orange';
        }
        return; // 提前返回，避免重复保存
    }

    const gameState = {
        car: car,
        walls: walls,
        wallHistory: wallHistory,
        redoHistory: redoHistory
    };
    localStorage.setItem(`parking_lot_save_${slot}`, JSON.stringify(gameState));
    messageBox.textContent = `游戏状态已保存到存档 ${slot}。`;
    messageBox.style.borderColor = 'green';
    updateSaveButtonStates(); // 保存后更新按钮状态
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

// --- 新增：更新存档按钮状态的函数 ---
function updateSaveButtonStates() {
    document.querySelectorAll('.save-btn').forEach(button => {
        const slot = button.dataset.slot;
        const saveData = localStorage.getItem(`parking_lot_save_${slot}`);
        const originalText = `存档 ${slot}`;

        if (saveData) {
            button.classList.add('has-save');
            button.textContent = `${originalText} [已有存档]`;
        } else {
            button.classList.remove('has-save');
            button.textContent = originalText;
        }
    });
}

document.querySelectorAll('.save-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const slot = e.target.dataset.slot;
        saveState(slot); // 调用新的保存逻辑
    });
});

document.querySelectorAll('.load-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const slot = e.target.dataset.slot;
        loadState(slot);
    });

    // 添加鼠标悬停预览功能
    button.addEventListener('mouseover', async (e) => {
        const slot = e.target.dataset.slot;
        const savedState = localStorage.getItem(`parking_lot_save_${slot}`);
        if (!savedState) return;

        const previewContainer = document.getElementById('preview-container');
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = previewCanvasRate * canvas.width; // 预览图宽度
        previewCanvas.height = previewCanvasRate * canvas.height; // 预览图高度
        const previewCtx = previewCanvas.getContext('2d');

        // 清除预览容器
        previewContainer.innerHTML = '';
        previewContainer.appendChild(previewCanvas);

        previewCtx.scale(previewCanvasRate, previewCanvasRate);

        // 悬浮预览存档中的游戏状态
        const gameState = JSON.parse(savedState);
        drawPreviewState(previewCtx, gameState, previewCanvasRate);

        // 定位预览容器
        const rect = e.target.getBoundingClientRect();
        previewContainer.style.left = `${rect.right - previewCanvas.width -  rect.width -10}px`;
        previewContainer.style.top = `${rect.top}px`;
        previewContainer.style.display = 'block';
    });

    button.addEventListener('mouseout', () => {
        const previewContainer = document.getElementById('preview-container');
        previewContainer.style.display = 'none';
    });
});

// 绘制预览状态的辅助函数
function drawPreviewState(ctx, gameState, scale) {
    // 绘制背景
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 800);

    // 绘制墙壁
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5 / scale; // 反缩放线宽
    gameState.walls.forEach(wall => {
        ctx.beginPath();
        ctx.moveTo(wall.x1, wall.y1);
        ctx.lineTo(wall.x2, wall.y2);
        ctx.stroke();
    });

    // 绘制汽车
    const car = gameState.car;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'blue';
    ctx.fillRect(-carWidth/2, -carHeight/2, carWidth, carHeight);
    ctx.restore();
}


// 初始化并读取存档1
restart();
loadState(1);
updateSaveButtonStates(); // 页面加载时初始化按钮状态
gameLoop(0); // 启动游戏循环