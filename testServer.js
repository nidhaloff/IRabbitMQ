var r = require('./IRabbitMQ');
const rabbitMQServer = 'amqp://evallx033.emea.porsche.biz:5672';




/*
 var r = new rabbit_test();

r.init(rabbitMQServer);

r.EventPublisher().receiver('hello'); 
*/



 
/* (async () => {
    let r = new rabbit();
    await r.ready;
    
   //r.taskResponse('test', 'test', 'test_queue', {resp : 'nidhaloff'});
    r.eventSubscriber('test', 'test');
 
})();   */

async function ServerSimulator() {

    //let r = new rabbit();
    await r.ready;

    r.taskResponse('test', 'test', 'test_queue', {resp : 'nidhaloff'});
}


ServerSimulator();